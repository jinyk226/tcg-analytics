# Documentation Index

Subsystem docs and implementation plans for TCG Analytics. See the root `CLAUDE.md` for
conventions and `specs/requirements.md` for product requirements.

## Contents

- **[7day-movers-export/](./7day-movers-export/)** — the first end-to-end feature: JustTCG
  ingestion + 7-day gainers/losers view with per-row copy and batch image export.
  - [`plan.md`](./7day-movers-export/plan.md) — full approved implementation plan.
  - [`progress.md`](./7day-movers-export/progress.md) — ordered, phase-by-phase task checklist.

## Conventions

- One folder per topic/feature; each holds a `plan.md` and a `progress.md`.
- `plan.md` = the design (kept in sync with what's actually built).
- `progress.md` = ordered tasks with status checkboxes, each phase ending in a verification step.
