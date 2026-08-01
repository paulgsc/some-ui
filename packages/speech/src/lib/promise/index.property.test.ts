import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { PendingSpeech } from "."
import { createSpeechLedger } from "."
import { createAbortError, isAbortError } from "./abort"

/**
 * The ledger is the invariant the rest of the package rests on, so it is
 * tested as one: for *any* interleaving of opens, resolves, rejects and
 * flushes, every promise it ever handed out settles exactly once, and the
 * ledger ends up holding nothing.
 *
 * Example-based tests can't cover this honestly. The bug being defended
 * against - a promise stranded because the thing that owned it was replaced
 * - only shows up at particular interleavings, and picking those by hand is
 * the same reasoning that produced the bug in the first place.
 */

type Op =
  | { kind: "open" }
  | { kind: "resolve"; index: number }
  | { kind: "reject"; index: number }
  | { kind: "flush" }

const opArbitrary: fc.Arbitrary<Op> = fc.oneof(
  fc.constant<Op>({ kind: "open" }),
  fc.record({
    kind: fc.constant("resolve" as const),
    index: fc.nat({ max: 40 }),
  }),
  fc.record({
    kind: fc.constant("reject" as const),
    index: fc.nat({ max: 40 }),
  }),
  fc.constant<Op>({ kind: "flush" })
)

type Watched = {
  entry: PendingSpeech
  outcomes: Array<"resolved" | "rejected">
}

function watch(entry: PendingSpeech): Watched {
  const outcomes: Array<"resolved" | "rejected"> = []
  void entry.promise.then(
    () => outcomes.push("resolved"),
    () => outcomes.push("rejected")
  )
  return { entry, outcomes }
}

describe("createSpeechLedger - settlement invariants", () => {
  it("settles every promise exactly once, whatever the interleaving", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(opArbitrary, { minLength: 1, maxLength: 40 }),
        async (ops) => {
          const ledger = createSpeechLedger()
          const watched: Array<Watched> = []

          const pick = (index: number): Watched | undefined =>
            watched.length === 0 ? undefined : watched[index % watched.length]

          const apply: Record<Op["kind"], (op: Op) => void> = {
            open: () => watched.push(watch(ledger.open())),
            resolve: (op) =>
              pick("index" in op ? op.index : 0)?.entry.resolve(),
            reject: (op) =>
              pick("index" in op ? op.index : 0)?.entry.reject(
                new Error("rejected")
              ),
            flush: () => ledger.flush(new Error("flushed")),
          }

          for (const op of ops) apply[op.kind](op)

          // Teardown is the moment the invariant has to hold: nothing may
          // still be waiting on a ledger nobody owns any more.
          ledger.flush(createAbortError("test teardown"))
          await Promise.resolve()
          await Promise.resolve()

          expect(ledger.size).toBe(0)
          for (const item of watched) {
            expect(item.entry.isSettled()).toBe(true)
            expect(item.outcomes).toHaveLength(1)
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it("empties itself on flush, for any number of open entries", () => {
    fc.assert(
      fc.property(fc.nat({ max: 30 }), (count) => {
        const ledger = createSpeechLedger()
        for (let i = 0; i < count; i++) ledger.open()
        expect(ledger.size).toBe(count)
        ledger.flush(createAbortError("flush"))
        expect(ledger.size).toBe(0)
      }),
      { numRuns: 100 }
    )
  })

  it("deregisters an entry that settles on its own", () => {
    const ledger = createSpeechLedger()
    const first = ledger.open()
    const second = ledger.open()
    expect(ledger.size).toBe(2)

    first.resolve()
    expect(ledger.size).toBe(1)
    second.reject(new Error("boom"))
    expect(ledger.size).toBe(0)
  })

  it("rejects with the error flush is given, so callers can tell why", async () => {
    const ledger = createSpeechLedger()
    const entry = ledger.open()
    ledger.flush(createAbortError("stopped"))
    await expect(entry.promise).rejects.toSatisfy(isAbortError)
  })

  it("ignores a second settle on an entry that already settled", async () => {
    const ledger = createSpeechLedger()
    const entry = ledger.open()
    entry.resolve()
    entry.reject(new Error("too late"))
    await expect(entry.promise).resolves.toBeUndefined()
    expect(ledger.size).toBe(0)
  })
})
