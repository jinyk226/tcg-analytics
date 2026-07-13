# How the Automated Ingest Works (a learning guide)

This doc explains, from the ground up, how TCG Analytics refreshes its pricing
data on a schedule — what each piece does and *why*. It's written to be read
top-to-bottom as a learning resource, not just a reference.

The goal: **run a full JustTCG sync roughly every other day at ~6am, without me
having to remember to do it, and without blowing the API budget.**

---

## 1. The moving parts

| File | Committed? | Role |
| ---- | ---------- | ---- |
| `scripts/ingest.ts` | ✅ repo | The actual sync program (`npm run ingest`). |
| `scripts/ingest-daily.sh` | ✅ repo | A thin **wrapper** launchd calls; adds the "every other day" guard + environment fixups. |
| `scripts/com.tcg-analytics.ingest.plist.template` | ✅ repo | A fill-in-the-blanks copy of the schedule definition, for reinstalling. |
| `~/Library/LaunchAgents/com.tcg-analytics.ingest.plist` | ❌ machine-only | The **installed** schedule (has your real paths). Lives in your home dir, not the repo. |
| `.ingest-last-run` | ❌ gitignored | A tiny file holding the Unix timestamp of the last successful sync. |
| `~/Library/Logs/tcg-analytics-ingest.log` | ❌ machine-only | Where each run's output is written. |

The chain of command is:

```
launchd  ──fires──▶  ingest-daily.sh  ──if 2 days passed──▶  npm run ingest  ──writes──▶  dev.db
   ▲                        │
   │                        └── else: log "skip" and exit
   └── schedule defined by the .plist
```

> **Location matters:** the repo must live *outside* `~/Documents`, `~/Desktop`, and
> `~/Downloads`, or the scheduled job fails with `exit 126` — see §7 for why.

---

## 2. launchd in 5 minutes

macOS doesn't use `cron` as its primary scheduler — it uses **launchd**, the
same system that starts and supervises every background service on the machine.
You describe a job in a **property list** (`.plist`, an XML file) and hand it to
launchd; launchd owns running it on time.

Why launchd instead of cron here?

- **It runs missed jobs on wake.** If your Mac is asleep at 6am, a `cron` job is
  simply skipped. launchd, with a *calendar* trigger, notices the time was
  missed and runs the job the next time the machine is awake. For a laptop
  that's usually closed overnight, this matters a lot.
- **It's the platform-native, supported path.** cron still works on macOS but is
  deprecated and sandbox-limited.

Two flavors of launchd job:

- **LaunchAgent** — runs *as you*, only when you're logged in, with access to
  your files and login keychain. Stored in `~/Library/LaunchAgents/`.
- **LaunchDaemon** — runs as root at boot, before login. Stored in
  `/Library/LaunchDaemons/`.

We want a LaunchAgent: the job reads *your* `.env` (API key), writes to a DB in
*your* home folder, and never needs root. Running it as your user is both
simpler and safer.

---

## 3. Anatomy of the plist

Here's the installed schedule, annotated. (Your copy has real absolute paths;
the committed template uses `__PLACEHOLDERS__`.)

```xml
<key>Label</key>
<string>com.tcg-analytics.ingest</string>
```
A unique reverse-DNS **identity** for the job. Every launchctl command refers to
the job by this label.

```xml
<key>ProgramArguments</key>
<array>
    <string>/bin/bash</string>
    <string>/…/tcg-analytics/scripts/ingest-daily.sh</string>
</array>
```
What to run: `bash scripts/ingest-daily.sh`. It's an argv array (program first,
then each argument), *not* a shell command string — so there's no shell parsing,
quoting, or `$PATH` lookup for the program itself. That's why the path is
absolute.

```xml
<key>WorkingDirectory</key>
<string>/…/tcg-analytics</string>
```
launchd `cd`s here before running. This is essential: the ingest reads `.env`
from the current directory and `DATABASE_URL="file:./dev.db"` is *relative* to
it. Wrong working dir → no API key, wrong database.

```xml
<key>EnvironmentVariables</key>
<dict>
    <key>PATH</key>
    <string>/…/.nvm/versions/node/v22.18.0/bin:/usr/local/bin:/usr/bin:/bin:…</string>
    <key>NVM_DIR</key>
    <string>/…/.nvm</string>
</dict>
```
launchd jobs start with a **bare environment** — almost none of the `PATH` your
interactive shell builds up from `.zshrc` exists. If we didn't set `PATH`, the
wrapper couldn't find `node`/`npm`. We seed it with the node bin directory plus
the standard system dirs. (More on the nvm subtlety in §5.)

```xml
<key>StartCalendarInterval</key>
<dict>
    <key>Hour</key><integer>6</integer>
    <key>Minute</key><integer>0</integer>
</dict>
```
The trigger: "at 6:00, every day." Omitting `Day`/`Weekday`/`Month` means *every*
value of those — i.e. daily. (You could pass an *array* of these dicts for
multiple times.)

```xml
<key>RunAtLoad</key>
<false/>
```
Don't run the instant the agent is loaded — only on schedule. We set this false
because the job was installed right after a manual full sync; running again
immediately would waste requests.

```xml
<key>StandardOutPath</key>
<string>/…/Library/Logs/tcg-analytics-ingest.log</string>
<key>StandardErrorPath</key>
<string>/…/Library/Logs/tcg-analytics-ingest.log</string>
```
launchd redirects the job's stdout and stderr to this file (both to the same
file here). This is your window into what happened at 6am while you were asleep.

---

## 4. The "every other day" trick

Here's a subtlety worth understanding: **launchd's calendar trigger can't say
"every 2 days."** `StartCalendarInterval` matches calendar *fields* (this hour,
this weekday, this day-of-month). "Every other day" doesn't map cleanly —
day-of-month wraps oddly at month boundaries (the 31st → the 1st are adjacent),
and a 7-day week is an odd number so weekdays can't alternate evenly either.

So we split responsibilities:

- **launchd** does what it's good at: fire reliably **once a day** at 6am.
- **The wrapper** decides whether *today's* firing should actually sync.

The wrapper keeps a timestamp of the last successful sync in `.ingest-last-run`
and only proceeds if enough time has passed:

```bash
MIN_GAP=$((44 * 3600))          # ~2 days, minus slack
now=$(date +%s)
last=$(cat .ingest-last-run)    # epoch seconds of last success
if (( now - last < MIN_GAP )); then
    echo "skip — last sync too recent"
    exit 0                      # today is a "rest" day
fi
# …otherwise run the sync, and on success: echo "$now" > .ingest-last-run
```

Why **44** hours and not 48? The 6am firings are ~48h apart on the days we
*want* to run, but clocks drift, DST shifts, and a wake-from-sleep run might land
a few minutes early. 44h gives ~4 hours of slack so a legitimate every-other-day
run is never accidentally skipped, while still blocking a same-day double-run
(which would be ~24h < 44h).

The stamp is only written **on success**. So if a sync fails (network blip, quota
hiccup), the timestamp stays old and the *next* morning's firing will retry
instead of waiting a full two days.

A concrete timeline (assume last sync stamped Mon 6am):

| Day | 6am firing | `now - last` | Action |
| --- | ---------- | ------------ | ------ |
| Mon | ✅ | (fresh stamp) | synced, stamp = Mon 6am |
| Tue | fires | ~24h | **skip** (< 44h) |
| Wed | fires | ~48h | **sync**, stamp = Wed 6am |
| Thu | fires | ~24h | **skip** |
| Fri | fires | ~48h | **sync** |

Net effect: a full sync every other day, at ~6am. ~15 syncs/month ×
~420 requests ≈ **6.3k requests**, comfortably under the 10k/month JustTCG cap.

---

## 5. Why the wrapper sources nvm

Node here is installed via **nvm** (Node Version Manager), which keeps each
version in a path like `~/.nvm/versions/node/v22.18.0/bin`. Two problems for a
scheduled job:

1. launchd's minimal environment doesn't include that directory in `PATH`.
2. That path has the **version number baked in** — the day you `nvm install` a
   newer node and switch to it, the hard-coded path in the plist goes stale and
   the job breaks.

The plist's `PATH` handles problem 1 for *today's* version. To also survive
problem 2, the wrapper re-derives node the way your shell does — by sourcing
nvm's script, which puts the *current default* node on `PATH`:

```bash
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
command -v npm >/dev/null || { echo "npm not found" >&2; exit 127; }
```

So there are two layers of defense: the plist `PATH` (fast path) and nvm sourcing
(self-healing). If both somehow fail, the explicit `command -v npm` check makes
the job fail loudly in the log rather than silently doing nothing.

---

## 6. Watching and debugging it

```bash
# Is the agent registered?
launchctl list | grep tcg-analytics
#   →  -   0   com.tcg-analytics.ingest
#      │   │   └ label
#      │   └ last exit code (0 = clean; nonzero = the last run failed)
#      └ PID while running, or "-" when idle

# Inspect full state, including the resolved PATH and next run:
launchctl print gui/$(id -u)/com.tcg-analytics.ingest

# What happened on recent runs?
tail -f ~/Library/Logs/tcg-analytics-ingest.log

# Force a run *right now* (bypasses the 6am schedule, but the wrapper's
# 2-day guard still applies — delete .ingest-last-run first to truly force):
launchctl kickstart -k gui/$(id -u)/com.tcg-analytics.ingest

# Run the wrapper directly in your terminal (easiest way to see errors live):
bash scripts/ingest-daily.sh
```

Two failure modes dominate launchd jobs. The first is a **PATH/environment**
problem — a command that works in your terminal isn't found by the job because
its environment is bare (that's what §5 defends against). The second is a
**file-access** problem unique to macOS, covered next.

---

## 7. The `~/Documents` trap (macOS TCC) — keep the repo out of protected folders

This one bites hard and the error message doesn't name the real cause. macOS
**TCC** (Transparency, Consent & Control) protects `~/Documents`, `~/Desktop`, and
`~/Downloads`: a process may read/enter them only if it holds an explicit grant.

Your interactive Terminal *has* that grant, so `npm run ingest` works when you run
it by hand. But a **launchd job runs unattended with no such grant.** If the repo
lives under one of those folders, the scheduled run can't even `cd` into its own
working directory:

```
shell-init: error retrieving current directory: getcwd: … Operation not permitted
/bin/bash: …/scripts/ingest-daily.sh: Operation not permitted
```

launchd records this as **`last exit code = 126`** ("cannot execute"). Everything
*looks* fine — the script is `+x`, the plist `PATH` is correct, it runs perfectly
by hand — because the problem is the **location**, not the code.

**The fix we use: keep the repo outside protected folders.** This project lives at
`~/coding/jinyk226/tcg-analytics` — deliberately **not** under `~/Documents` — so the
background job has unrestricted access with no special permissions. (It originally
lived under `~/Documents` and every scheduled run failed with 126 until it was
moved.)

Alternative, if you must keep it under `~/Documents`: grant **Full Disk Access** to
`/bin/bash` in System Settings → Privacy & Security → Full Disk Access (⌘⇧G →
`/bin/bash`). It works, but it's broad — *every* script bash runs then gains
full-disk access — which is why relocating the repo is the cleaner fix.

**How to recognize it:** `launchctl print … | grep "last exit code"` shows `126`,
and the log is full of `Operation not permitted`. After relocating (or granting
access), `launchctl kickstart -k …` and confirm the code flips to `0`.

---

## 8. Lifecycle: install, disable, reinstall

**Disable** (stop the schedule; leaves files in place):
```bash
launchctl bootout gui/$(id -u)/com.tcg-analytics.ingest
```

**Re-enable / install on a new machine** (from the committed template):
```bash
# 1. Fill placeholders: __PROJECT_DIR__, __NODE_BIN__ (= dirname "$(which node)"), __HOME__
cp scripts/com.tcg-analytics.ingest.plist.template \
   ~/Library/LaunchAgents/com.tcg-analytics.ingest.plist
#    …edit the three placeholders…

# 2. Load it (bootstrap replaces the old load -w):
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.tcg-analytics.ingest.plist

# 3. Confirm:
launchctl list | grep tcg-analytics
```

**After a node upgrade:** the wrapper's nvm sourcing should keep things working
even if the plist's hard-coded node path is now stale. If you want to be tidy,
update the `PATH` line in the installed plist to the new
`dirname "$(which node)"` and `bootout` + `bootstrap` to reload.

---

## 9. Recap: the design in one breath

launchd fires a daily 6am alarm (and catches up after sleep). A wrapper turns
that daily alarm into an *every-other-day* action using a timestamp file, keeps
node reachable in launchd's bare environment via nvm, only records success so
failures retry, and logs everything to one file. The result is fresh 7-day
movers data with zero manual effort and a request count that stays well under
the API plan's monthly limit.
