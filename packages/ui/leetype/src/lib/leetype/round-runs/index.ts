/**
 * A round's recorded runs (X2, #1223; the server half is X5, #1226 /
 * `paulgsc/server#381`): what `A` and each `A + d` did when the server's
 * runner built them with the round's `harness` and ran them at
 * `constraintDiff.before`'s bounds and at `after`'s.
 *
 * # Evidence, never the grade
 *
 * A run establishes a concrete fact about one input and nothing more
 * (Prop. 4.1); no finite set of runs entails a class (Thm. 4.1). So nothing
 * here returns a cost, a class, a verdict or a proposition, and nothing that
 * decides admissibility (`lib/leetype/round-cycle`, the cost graphs) reads
 * a run: X1's type-level omission (`lib/leetype/run-result`) holds for this
 * module too. What it returns is words about what happened, for the round
 * surface to show once the learner has committed.
 *
 * # One shape from both sources (X2)
 *
 * `RoundRunsSchema` is the route's body (`GET /leetype/rounds/:id/runs`,
 * `leetype_round_repo::RoundRuns`) and the static snapshot's
 * `runs/<id>.json` alike: the server writes both from the same rows.
 * `resolveRoundRuns` takes the host's fetched transcript when there is a
 * usable one and this package's bundled copy (`./bundled`) otherwise, and
 * returns the same parsed value either way, with nothing saying which.
 *
 * # Keyed to the bytes that ran
 *
 * A transcript names the `contentHash` of the round body it was recorded
 * for: SHA-256, hex, over the stored bytes (`paulgsc/server`'s
 * `curriculum_repo::content_hash`). Those bytes are `serializeRound`'s, the
 * one serialization of a round that leaves this repository, so this module
 * hashes `serializeRound(round)` with Web Crypto and shows a transcript only
 * when the hashes agree. A round edited since its runs were recorded (a
 * server serving an older transcript, or a bundled one left behind) shows
 * nothing rather than runs of a program the learner is not reading. Where
 * `crypto.subtle` does not exist (a page served over plain http from a
 * non-localhost host), nothing can be checked and nothing is shown; the
 * round plays the same, since it never needed a run (Rem. 8.0).
 */
import { serializeRound } from "@leetype/lib/leetype/round-export"
import { BUNDLED_ROUND_RUNS } from "@leetype/lib/leetype/round-runs/bundled"
import type { RunResult } from "@leetype/lib/leetype/run-result"
import type { Round } from "@leetype/types/authored-round"
import { z } from "zod"

/** Which constraint set a run's sizes came from: `C` (`before`) or `C′` (`after`). */
const RunBoundsSchema = z.enum(["before", "after"])
export type RunBounds = z.infer<typeof RunBoundsSchema>

const RunResultSchema: z.ZodType<RunResult> = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ok"),
    inputSize: z.number().nonnegative(),
    observation: z.object({
      output: z.string(),
      logs: z.array(z.string()),
      elapsed: z.object({ milliseconds: z.number().nonnegative() }),
    }),
  }),
  z.object({
    kind: z.literal("error"),
    inputSize: z.number().nonnegative(),
    error: z.object({
      errorClass: z.enum(["compile", "runtime", "budget-exceeded"]),
      message: z.string(),
    }),
  }),
])

const RecordedRunSchema = z.object({
  /** `"A"`, or `"d<i>"` for `round.diffOptions[i]`, in authored order. */
  variant: z.string().regex(/^(A|d[0-9])$/),
  bounds: RunBoundsSchema,
  /** Every dimension's size, as the harness was given it. */
  sizes: z.record(z.string(), z.number().int().nonnegative()),
  result: RunResultSchema,
})

/**
 * `GET /leetype/rounds/:id/runs`, hand-written against
 * `leetype_round_repo::RoundRuns` (`crates/db/leetype_round/src/runs.rs`
 * in `paulgsc/server`), per #1042. Unknown keys are stripped, not refused:
 * the server may add to it.
 */
export const RoundRunsSchema = z.object({
  roundId: z.string().min(1),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  runs: z.array(RecordedRunSchema),
})
export type RoundRuns = z.infer<typeof RoundRunsSchema>

/**
 * Where a host's transcript comes from: `apps/www`'s `loadLeetypeRoundRuns`
 * fetches the route in `server` mode and resolves `null` in `static` mode,
 * issuing no request. Resolves to the raw body, which this module parses.
 */
export type RoundRunsLoader = (roundId: string) => Promise<unknown>

/** SHA-256, hex, of `serializeRound(round)`: the server's `content_hash` of the same body. `null` without Web Crypto. */
export async function roundContentHash(round: Round): Promise<string | null> {
  const bytes = new TextEncoder().encode(serializeRound(round))
  let digest: ArrayBuffer
  try {
    // Typed as always present, but `crypto.subtle` is undefined outside a
    // secure context, and reading `digest` off it then throws.
    digest = await crypto.subtle.digest("SHA-256", bytes)
  } catch {
    return null
  }
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

/** `raw`, when it parses and is a non-empty transcript of exactly this round's bytes. */
function transcriptFor(
  raw: unknown,
  roundId: string,
  contentHash: string
): RoundRuns | null {
  const parsed = RoundRunsSchema.safeParse(raw)
  if (!parsed.success) return null
  const { data } = parsed
  return data.roundId === roundId &&
    data.contentHash === contentHash &&
    data.runs.length > 0
    ? data
    : null
}

/**
 * The runs to show for `round`, or `null` for none.
 *
 * `load`'s transcript first, then the bundled one; either is used only when
 * it parses, names this round and was recorded for this round's current
 * bytes. A loader that rejects, answers `runs: []` (nothing recorded for
 * this version) or answers for other bytes falls through to the bundled
 * copy, which is held to the same test. Never rejects: a run is never
 * required (X5's never #4), so any failure is simply no transcript.
 *
 * Fails open to the bundled copy, unlike `sessions-backend`, which fails
 * loudly: this is a read of a recording the package already carries, the
 * read-versus-write reasoning #1043 gave for the activity catalogue, and a
 * round that shows its recorded runs is better than one that shows none.
 */
export async function resolveRoundRuns(
  round: Round,
  load?: RoundRunsLoader,
  bundled: Readonly<Record<string, unknown>> = BUNDLED_ROUND_RUNS
): Promise<RoundRuns | null> {
  const contentHash = await roundContentHash(round)
  if (contentHash === null) return null
  if (load !== undefined) {
    try {
      const served = transcriptFor(await load(round.id), round.id, contentHash)
      if (served !== null) return served
    } catch {
      // Unreachable, a 404, a timeout: the bundled copy, below.
    }
  }
  return Object.hasOwn(bundled, round.id)
    ? transcriptFor(bundled[round.id], round.id, contentHash)
    : null
}

/** The transcript's label for `round.diffOptions[index]` (authored order, not presentation order). */
export function variantOf(index: number): string {
  return `d${index}`
}

const SIZE_FORMAT = new Intl.NumberFormat("en-US")

/** The longest output shown verbatim; a longer one is cut, and says so. */
const OUTPUT_SHOWN_CHARS = 60

/**
 * One run, in words: which sizes, what happened. Only what the run did —
 * never why, never what it means for a class (Thm. 4.1) or for the budget.
 */
export type RunLine = {
  readonly bounds: RunBounds
  /** `n = 100,000, q = 100,000`, in the constraint set's order. */
  readonly sizes: string
  /** What happened, as a clause: "finished in 8 ms and printed false". */
  readonly outcome: string
  /** The runner's or the toolchain's own message, for a run that failed. */
  readonly detail: string | null
}

function sizesOf(
  sizes: Readonly<Record<string, number>>,
  order: ReadonlyArray<string>
): string {
  const dimensions = [
    ...order.filter((dimension) => Object.hasOwn(sizes, dimension)),
    ...Object.keys(sizes)
      .filter((dimension) => !order.includes(dimension))
      .sort(),
  ]
  return dimensions
    .map(
      (dimension) => `${dimension} = ${SIZE_FORMAT.format(sizes[dimension]!)}`
    )
    .join(", ")
}

function outcomeOf(result: RunResult): Pick<RunLine, "outcome" | "detail"> {
  if (result.kind === "ok") {
    const { output, elapsed } = result.observation
    const shown =
      output.length > OUTPUT_SHOWN_CHARS
        ? `${output.slice(0, OUTPUT_SHOWN_CHARS)}…`
        : output
    const printed = output.length === 0 ? "printed nothing" : `printed ${shown}`
    return {
      outcome: `finished in ${SIZE_FORMAT.format(Math.round(elapsed.milliseconds))} ms and ${printed}`,
      detail: null,
    }
  }
  const outcome = {
    "budget-exceeded": "did not finish within the time limit, and was stopped",
    compile: "did not compile",
    runtime: "stopped with an error while running",
  }[result.error.errorClass]
  return { outcome, detail: result.error.message }
}

/**
 * `variant`'s runs, `before` then `after`, in words. `order` is the
 * round's constraint dimensions in authored order, so sizes read in the
 * order the Bounds card lists them.
 */
export function runLinesOf(
  transcript: RoundRuns,
  variant: string,
  order: ReadonlyArray<string>
): ReadonlyArray<RunLine> {
  return RunBoundsSchema.options.flatMap((bounds) => {
    const run = transcript.runs.find(
      (candidate) =>
        candidate.variant === variant && candidate.bounds === bounds
    )
    return run === undefined
      ? []
      : [{ bounds, sizes: sizesOf(run.sizes, order), ...outcomeOf(run.result) }]
  })
}
