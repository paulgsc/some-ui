/**
 * The recorded runs this package ships (X2, #1223): `corpus/runs/<id>.json`,
 * one per reviewed round, copied verbatim from `paulgsc/server`'s
 * `dump-leetype-snapshot` (LTY-SRV4, `paulgsc/server#328`). They are the
 * route's own bytes (`GET /leetype/rounds/:id/runs`) for the round version
 * the server recorded, so the static build plays the same transcript a
 * server build fetches, with zero requests.
 *
 * Machine-produced, never hand-edited (Rem. 11.3): regenerate them with the
 * server's `record-leetype-runs` and `dump-leetype-snapshot`
 * (`apps/servers/file_host/docs/leetype-execution.md` there), then copy the
 * snapshot's `runs/` over `corpus/runs/`. `scripts/check-round-runs.ts`
 * (in `lint:corpus`) fails when a reviewed round has no transcript, when a
 * transcript does not parse, or when one was recorded for bytes other than
 * the round's current export.
 *
 * Static imports rather than `import.meta.glob`, so the same map loads under
 * `tsx` (the lint scripts), vitest and the library build alike; the check
 * script also fails when a file in `corpus/runs/` is missing from this map.
 */
import countAtLeastMaxHoist from "@leetype-corpus/runs/count-at-least-max-hoist.json"
import countPresentSortedLookup from "@leetype-corpus/runs/count-present-sorted-lookup.json"
import hasDuplicateSortAdjacent from "@leetype-corpus/runs/has-duplicate-sort-adjacent.json"
import minGapSortAdjacent from "@leetype-corpus/runs/min-gap-sort-adjacent.json"
import rangeSumsPrefix from "@leetype-corpus/runs/range-sums-prefix.json"

/** Round id → its recorded transcript, unparsed: `resolveRoundRuns` parses and checks it as it would a fetched one. */
export const BUNDLED_ROUND_RUNS: Readonly<Record<string, unknown>> = {
  "count-at-least-max-hoist": countAtLeastMaxHoist,
  "count-present-sorted-lookup": countPresentSortedLookup,
  "has-duplicate-sort-adjacent": hasDuplicateSortAdjacent,
  "min-gap-sort-adjacent": minGapSortAdjacent,
  "range-sums-prefix": rangeSumsPrefix,
}
