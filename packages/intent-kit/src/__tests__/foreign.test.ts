/**
 * The five laws of `callForeign` (see `foreign.ts`), checked as one property
 * over what a foreign API can do rather than as a list of cases: answer or
 * fail at any time, fail with anything at all, throw before returning,
 * return a plain value, or never answer; with the caller abandoning at any
 * point, and a classifier or reporter that itself throws. Every port shares
 * this one suite, because every port goes through the same `callForeign`.
 */

import type {
  ForeignFailure,
  ForeignOutcome,
  ForeignVerdict,
} from "@intent-kit/foreign"
import {
  addFailureSink,
  callForeign,
  FOREIGN_FAILURE_TAG,
  ForeignDeadlineError,
  reportFailure,
} from "@intent-kit/foreign"
import { assertNever } from "@intent-kit/intent"
import fc from "fast-check"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Behaviour =
  | { readonly kind: "resolves"; readonly at: number; readonly value: unknown }
  | { readonly kind: "rejects"; readonly at: number; readonly error: unknown }
  | { readonly kind: "throws"; readonly error: unknown }
  | { readonly kind: "returns"; readonly value: unknown }
  | { readonly kind: "hangs" }

const behaviour: fc.Arbitrary<Behaviour> = fc.oneof(
  fc.record({
    kind: fc.constant("resolves" as const),
    at: fc.integer({ min: 0, max: 2_000 }),
    value: fc.anything(),
  }),
  fc.record({
    kind: fc.constant("rejects" as const),
    at: fc.integer({ min: 0, max: 2_000 }),
    error: fc.anything(),
  }),
  fc.record({ kind: fc.constant("throws" as const), error: fc.anything() }),
  fc.record({ kind: fc.constant("returns" as const), value: fc.anything() }),
  fc.constant({ kind: "hangs" as const })
)

const scenario = fc.record({
  behaviour,
  deadlineMs: fc.integer({ min: 1, max: 1_500 }),
  abandonAt: fc.option(fc.integer({ min: 0, max: 2_000 }), { nil: undefined }),
  classifierThrows: fc.boolean(),
  reporterThrows: fc.boolean(),
})

const VERDICT: ForeignVerdict = {
  kind: "unavailable",
  retryable: false,
  summary: "Not on this device.",
}

/** When the foreign side answers, or null if it never does. */
function answersAt(b: Behaviour): number | null {
  if (b.kind === "resolves" || b.kind === "rejects") return b.at
  if (b.kind === "throws" || b.kind === "returns") return 0
  return null
}

describe("callForeign", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("settles once, by its deadline, in our words with the foreign cause, reported once, ignoring anything late", async () => {
    await fc.assert(
      fc.asyncProperty(scenario, async (s) => {
        const reports: Array<ForeignFailure> = []
        const seen: { signal?: AbortSignal } = {}
        const call = callForeign<unknown>({
          port: {
            name: "test port",
            classify: (): ForeignVerdict => {
              if (s.classifierThrows) throw new Error("classifier broke")
              return VERDICT
            },
            report: (failure): void => {
              reports.push(failure)
              if (s.reporterThrows) throw new Error("reporter broke")
            },
          },
          deadlineMs: s.deadlineMs,
          start: (given) => {
            seen.signal = given
            const b = s.behaviour
            switch (b.kind) {
              case "resolves": {
                return new Promise((resolve) =>
                  setTimeout(() => resolve(b.value), b.at)
                )
              }
              case "rejects": {
                return new Promise((_, reject) =>
                  setTimeout(() => reject(b.error), b.at)
                )
              }
              case "throws": {
                throw b.error
              }
              case "returns": {
                return b.value
              }
              case "hangs": {
                return new Promise(() => undefined)
              }
              default: {
                return assertNever(b)
              }
            }
          },
        })
        const settled: Array<ForeignOutcome<unknown>> = []
        let rejected = false
        call.outcome.then(
          (outcome) => {
            settled.push(outcome)
          },
          () => {
            rejected = true
          }
        )
        if (s.abandonAt !== undefined) setTimeout(call.abandon, s.abandonAt)
        // Past everything the scenario can schedule, so late answers land too.
        await vi.advanceTimersByTimeAsync(5_000)

        const answer = answersAt(s.behaviour)
        // Ties between timers are ordering, not law: leave them out.
        fc.pre(answer !== s.deadlineMs && answer !== s.abandonAt)
        fc.pre(s.abandonAt !== s.deadlineMs)

        // Law 1: it settles, exactly once, and never rejects.
        expect(rejected).toBe(false)
        expect(settled).toHaveLength(1)
        const [outcome] = settled
        if (outcome === undefined) throw new Error("unreachable: settled once")

        // Who got there first decides; nothing after changes it (law 5).
        const first = Math.min(
          answer ?? Infinity,
          s.deadlineMs,
          s.abandonAt ?? Infinity
        )
        if (first === s.abandonAt) {
          expect(outcome.status).toBe("abandoned")
        } else if (first === s.deadlineMs) {
          // Law 2: the deadline, as our failure, and the foreign side is told.
          expect(outcome.status).toBe("failed")
          if (outcome.status !== "failed") return
          expect(outcome.error.cause).toBeInstanceOf(ForeignDeadlineError)
        } else if (
          s.behaviour.kind === "resolves" ||
          s.behaviour.kind === "returns"
        ) {
          expect(outcome.status).toBe("succeeded")
          if (outcome.status !== "succeeded") return
          expect(outcome.value).toBe(s.behaviour.value)
        } else if (
          s.behaviour.kind === "rejects" ||
          s.behaviour.kind === "throws"
        ) {
          // Law 3: what the foreign side threw is the cause, unchanged.
          expect(outcome.status).toBe("failed")
          if (outcome.status !== "failed") return
          expect(outcome.error.cause).toBe(s.behaviour.error)
        }
        if (outcome.status !== "succeeded") {
          expect(seen.signal?.aborted).toBe(true)
        }

        // Law 3: our words, or `unknown` when the classifier broke.
        if (outcome.status === "failed") {
          expect(outcome.error.kind).toBe(
            s.classifierThrows ? "unknown" : "unavailable"
          )
        }
        // Law 4: every failure reported exactly once, nothing else ever.
        expect(reports).toEqual(
          outcome.status === "failed"
            ? [{ port: "test port", error: outcome.error }]
            : []
        )
      }),
      { numRuns: 300 }
    )
  })

  it("refuses a call with no real deadline", () => {
    const port = {
      name: "test port",
      classify: (): ForeignVerdict => VERDICT,
      report: (): void => undefined,
    }
    for (const deadlineMs of [0, -1, Number.NaN, Infinity]) {
      expect(() =>
        callForeign({ port, deadlineMs, start: () => undefined })
      ).toThrow(RangeError)
    }
  })
})

describe("reportFailure", () => {
  const failure: ForeignFailure = {
    port: "test port",
    error: { ...VERDICT, cause: new Error("the platform's words") },
  }

  it("writes a tagged console line with the cause, then hands the failure to every sink until removed", () => {
    const console = vi.spyOn(globalThis.console, "error").mockReturnValue()
    const seen: Array<ForeignFailure> = []
    const broken = addFailureSink(() => {
      throw new Error("a sink that breaks")
    })
    const remove = addFailureSink((reported) => {
      seen.push(reported)
    })
    try {
      reportFailure(failure)
      expect(console).toHaveBeenCalledWith(
        FOREIGN_FAILURE_TAG,
        "[test port] unavailable: Not on this device.",
        failure.error.cause
      )
      // A sink that throws is skipped; the next one still hears.
      expect(seen).toEqual([failure])
      remove()
      reportFailure(failure)
      expect(seen).toHaveLength(1)
    } finally {
      broken()
      console.mockRestore()
    }
  })
})
