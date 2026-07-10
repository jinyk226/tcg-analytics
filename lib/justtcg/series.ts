// Assigns each JustTCG set to a Pokémon "series"/era. The API has no series
// field, so we derive it. Pokémon eras are strictly chronological, so a
// release-date window is a reliable default; the curated override map handles
// the exceptions (promos, mis-dated or specially-grouped sets).

/**
 * Curated set-slug → series overrides. Add entries here when the date fallback
 * gets a set wrong (e.g. a promo set that should roll up into a main series).
 * Example: "sv-black-star-promos-pokemon": "Scarlet & Violet".
 */
const SERIES_OVERRIDES: Record<string, string> = {};

/**
 * Era start dates, newest first. A set is assigned to the first era whose start
 * date is on/before the set's release date. Keep this ordered descending.
 */
const ERA_STARTS: ReadonlyArray<{ series: string; start: string }> = [
  { series: "Mega Evolution", start: "2025-09-01" },
  { series: "Scarlet & Violet", start: "2023-01-01" },
  { series: "Sword & Shield", start: "2019-11-01" },
  { series: "Sun & Moon", start: "2017-02-01" },
  { series: "XY", start: "2014-02-01" },
  { series: "Black & White", start: "2011-04-01" },
  { series: "HeartGold & SoulSilver", start: "2010-02-01" },
  { series: "Platinum", start: "2009-02-01" },
  { series: "Diamond & Pearl", start: "2007-05-01" },
  { series: "EX", start: "2003-06-01" },
  { series: "e-Card", start: "2002-09-01" },
  { series: "Neo", start: "2000-12-01" },
  { series: "Base", start: "1999-01-01" },
];

const UNCATEGORIZED = "Uncategorized";

/** Resolve a set's series from a curated override, else its release date. */
export function resolveSeries(input: {
  slug: string;
  releaseDate?: Date | string | null;
}): string {
  const override = SERIES_OVERRIDES[input.slug];
  if (override) return override;

  if (!input.releaseDate) return UNCATEGORIZED;
  const released =
    input.releaseDate instanceof Date
      ? input.releaseDate
      : new Date(input.releaseDate);
  if (Number.isNaN(released.getTime())) return UNCATEGORIZED;

  for (const era of ERA_STARTS) {
    if (released >= new Date(era.start)) return era.series;
  }
  return UNCATEGORIZED;
}
