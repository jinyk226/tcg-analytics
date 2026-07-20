import "dotenv/config";
import { db } from "@/lib/db";
import { syncGamePokemon } from "@/lib/justtcg/ingest";

/**
 * CLI: sync JustTCG Pokémon data into the local DB.
 *   npm run ingest                     # full catalog sync
 *   npm run ingest -- --set sv1-pokemon    # one set (quick test)
 *   npm run ingest -- --max-sets 3     # cap sets this run
 *   npm run ingest -- --incremental    # skip sets synced in the last 20h
 */
function parseArgs(argv: string[]) {
  const opts: {
    onlySet?: string;
    maxSets?: number;
    incrementalHours?: number;
    game: string;
  } = { game: "pokemon" };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--set") opts.onlySet = next();
    else if (arg === "--max-sets") opts.maxSets = Number(next());
    else if (arg === "--game") opts.game = next() ?? "pokemon";
    else if (arg === "--incremental") opts.incrementalHours = 20;
    else if (arg.startsWith("--incremental=")) opts.incrementalHours = Number(arg.split("=")[1]);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.game !== "pokemon") {
    throw new Error(`Only "pokemon" is supported right now (got "${opts.game}").`);
  }

  const started = Date.now();
  console.log(`Ingest starting${opts.onlySet ? ` (set=${opts.onlySet})` : ""}...`);

  const result = await syncGamePokemon({
    onlySet: opts.onlySet,
    maxSets: opts.maxSets,
    incrementalHours: opts.incrementalHours,
    onProgress: (line) => console.log(line),
  });

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `\nDone in ${secs}s — sets=${result.setsProcessed}, cards=${result.cardsUpserted}, ` +
      `variants=${result.variantsUpserted}` +
      (result.setsFailed ? `, failed=${result.setsFailed}` : "") +
      (result.stoppedEarly ? " (stopped early: quota)" : "") +
      ".",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
