import { createHash } from "node:crypto"
import { AUTHORED_ROUNDS } from "@leetype/lib/leetype/authored-rounds"
import { checkNoMeasurementEntailmentClaim } from "@leetype/lib/leetype/exercises/corpus-lint"
import { serializeRound } from "@leetype/lib/leetype/round-export"
import type { RoundRuns } from "@leetype/lib/leetype/round-runs"
import {
  resolveRoundRuns,
  roundContentHash,
  RoundRunsSchema,
  runLinesOf,
  variantOf,
} from "@leetype/lib/leetype/round-runs"
import { BUNDLED_ROUND_RUNS } from "@leetype/lib/leetype/round-runs/bundled"
import type { Round } from "@leetype/types/authored-round"
import { afterEach, describe, expect, it, vi } from "vitest"

function roundNamed(id: string): Round {
  const round = AUTHORED_ROUNDS.find((candidate) => candidate.id === id)
  if (round === undefined) throw new Error(`no authored round ${id}`)
  return round
}

const HAS_DUPLICATE = roundNamed("has-duplicate-sort-adjacent")
const RECORDED: unknown = BUNDLED_ROUND_RUNS[HAS_DUPLICATE.id]
const PARSED: RoundRuns = RoundRunsSchema.parse(RECORDED)

/** The same transcript, as a server with other bytes (or another round) would answer. */
function recordedWith(patch: Partial<RoundRuns>): unknown {
  return { ...PARSED, ...patch }
}

type Loader = () => Promise<unknown>

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("roundContentHash", () => {
  it("is the server's content_hash: SHA-256, hex, of serializeRound's bytes", async () => {
    for (const round of AUTHORED_ROUNDS) {
      const expected = createHash("sha256")
        .update(serializeRound(round))
        .digest("hex")
      await expect(roundContentHash(round)).resolves.toBe(expected)
    }
  })

  it("is null where Web Crypto has no subtle (an insecure context)", async () => {
    vi.stubGlobal("crypto", {})
    await expect(roundContentHash(HAS_DUPLICATE)).resolves.toBeNull()
  })
})

describe("resolveRoundRuns — one shape from either source (X2)", () => {
  it("every reviewed round has a bundled transcript of its current bytes", async () => {
    for (const round of AUTHORED_ROUNDS) {
      const transcript = await resolveRoundRuns(round)
      expect(transcript?.roundId).toBe(round.id)
      expect(transcript?.contentHash).toBe(await roundContentHash(round))
    }
  })

  it("a served transcript and the bundled one resolve to the same value", async () => {
    const load = vi.fn(() => Promise.resolve(structuredClone(RECORDED)))
    const served = await resolveRoundRuns(HAS_DUPLICATE, load)
    const bundled = await resolveRoundRuns(HAS_DUPLICATE)
    expect(load).toHaveBeenCalledWith(HAS_DUPLICATE.id)
    expect(served).not.toBeNull()
    expect(served).toEqual(bundled)
  })

  it("prefers the served transcript when it is usable", async () => {
    const served = recordedWith({
      runs: PARSED.runs.slice(0, 1),
    })
    const transcript = await resolveRoundRuns(HAS_DUPLICATE, () =>
      Promise.resolve(served)
    )
    expect(transcript?.runs).toHaveLength(1)
  })

  it.each<[string, Loader]>([
    [
      "the loader rejects (unreachable, a 404, a timeout)",
      (): Promise<unknown> => Promise.reject(new Error("404")),
    ],
    [
      "nothing is recorded for this version",
      (): Promise<unknown> => Promise.resolve(recordedWith({ runs: [] })),
    ],
    [
      "it was recorded for other bytes",
      (): Promise<unknown> =>
        Promise.resolve(recordedWith({ contentHash: "0".repeat(64) })),
    ],
    [
      "it names another round",
      (): Promise<unknown> =>
        Promise.resolve(recordedWith({ roundId: "range-sums-prefix" })),
    ],
    [
      "it is not a transcript",
      (): Promise<unknown> => Promise.resolve("<!doctype html>"),
    ],
    [
      "the static build asks nothing",
      (): Promise<unknown> => Promise.resolve(null),
    ],
  ])("falls back to the bundled transcript when %s", async (_, load) => {
    await expect(resolveRoundRuns(HAS_DUPLICATE, load)).resolves.toEqual(
      await resolveRoundRuns(HAS_DUPLICATE)
    )
  })

  it("shows nothing for a round whose bytes no transcript was recorded for", async () => {
    const edited: Round = {
      ...HAS_DUPLICATE,
      budget: { ...HAS_DUPLICATE.budget, operations: 99 },
    }
    const load = (): Promise<unknown> => Promise.resolve(RECORDED)
    await expect(resolveRoundRuns(edited, load)).resolves.toBeNull()
    await expect(resolveRoundRuns(edited)).resolves.toBeNull()
  })

  it("shows nothing, rather than rejecting, for a round that does not parse", async () => {
    // `serializeRound` parses; an unparsable round must not reject.
    const broken: Round = { ...HAS_DUPLICATE, diffOptions: [] }
    await expect(resolveRoundRuns(broken)).resolves.toBeNull()
  })

  it("shows nothing for a round nobody recorded, and never rejects", async () => {
    const own: Round = { ...HAS_DUPLICATE, id: "own:has-duplicate" }
    await expect(
      resolveRoundRuns(own, () => Promise.reject(new Error("down")))
    ).resolves.toBeNull()
  })

  it("shows nothing without Web Crypto, rather than an unchecked transcript", async () => {
    vi.stubGlobal("crypto", {})
    await expect(
      resolveRoundRuns(HAS_DUPLICATE, () => Promise.resolve(RECORDED))
    ).resolves.toBeNull()
  })
})

describe("runLinesOf — what happened, in words", () => {
  it("says what A and a rewrite did at each set of bounds", async () => {
    const transcript = (await resolveRoundRuns(HAS_DUPLICATE))!
    expect(runLinesOf(transcript, "A", ["n"])).toEqual([
      {
        bounds: "before",
        sizes: "n = 1,000",
        outcome: "finished in 9 ms and printed false",
        detail: null,
      },
      {
        bounds: "after",
        sizes: "n = 100,000",
        outcome: "did not finish within the time limit, and was stopped",
        detail:
          "the program did not finish within the 2000 ms wall-clock ceiling, and was killed",
      },
    ])
    expect(runLinesOf(transcript, variantOf(0), ["n"])[1]).toMatchObject({
      outcome: "finished in 8 ms and printed false",
    })
    expect(runLinesOf(transcript, "d7", ["n"])).toEqual([])
  })

  it("lists sizes in the round's constraint order", async () => {
    const round = roundNamed("count-present-sorted-lookup")
    const transcript = (await resolveRoundRuns(round))!
    const order = round.constraintDiff.after.map(({ dimension }) => dimension)
    const [before] = runLinesOf(transcript, "A", order)
    expect(before?.sizes).toBe(
      order.map((dimension) => `${dimension} = 1,000`).join(", ")
    )
  })

  it("never states or implies a class, and never reads one off a time (Thm. 4.1, Cor. 4.1)", async () => {
    for (const round of AUTHORED_ROUNDS) {
      const transcript = (await resolveRoundRuns(round))!
      const order = round.constraintDiff.after.map(({ dimension }) => dimension)
      const variants = [
        "A",
        ...round.diffOptions.map((_, index) => variantOf(index)),
      ]
      for (const variant of variants) {
        for (const line of runLinesOf(transcript, variant, order)) {
          const text = `${line.sizes}: ${line.outcome}. ${line.detail ?? ""}`
          expect(text).not.toMatch(
            /Θ|Ω|\bO\(|quadratic|linear|logarithmic|admissib|n²|log n/i
          )
          expect(checkNoMeasurementEntailmentClaim(text, round.id)).toEqual([])
        }
      }
    }
  })
})
