import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { createEventChannel, type SensedToken } from "./observer"

/**
 * Theorem 5.1 (order-independence of the estimator) requires only that its
 * *input* — the channel's output multiset — carry no ordering information
 * the fold depends on. This file does not re-implement the Estimator (S6);
 * it proves the Channel's (S4) output shape is fold-compatible: an
 * unordered, duplication-tolerant sequence of plain tokens, with no attempt
 * by the channel itself to fix order or drop duplicates (Axioms 3.1–3.3).
 */

type Attrs = { readonly text: string }

// A local stand-in for Definition 5.3's max_⪯, restricted to the two
// coordinates the channel controls (epoch, timestamp) — tier (S5) and the
// full canon order (S6) are out of scope here.
function maxToken(
  a: SensedToken<string, Attrs> | undefined,
  b: SensedToken<string, Attrs>
): SensedToken<string, Attrs> {
  if (a === undefined) return b
  if (a.epoch !== b.epoch) return a.epoch > b.epoch ? a : b
  return a.timestamp >= b.timestamp ? a : b
}

function fold(
  tokens: ReadonlyArray<SensedToken<string, Attrs>>
): SensedToken<string, Attrs> | undefined {
  return tokens.reduce<SensedToken<string, Attrs> | undefined>(
    maxToken,
    undefined
  )
}

function ingestAll(
  timestamps: ReadonlyArray<number>
): Array<SensedToken<string, Attrs>> {
  const emitted: Array<SensedToken<string, Attrs>> = []
  const channel = createEventChannel<number, string, Attrs>({
    toTokens: (raw) => [{ key: "k", attrs: { text: "k" }, timestamp: raw }],
    currentEpoch: () => 0,
    emit: (token) => emitted.push(token),
  })

  for (const ts of timestamps) {
    channel.ingest(ts)
  }
  return emitted
}

describe("sensor — Theorem 5.1 precondition (fuzz)", () => {
  it("the channel's output folds to the same maximum under any permutation or duplication of an arbitrary delivery multiset", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 1000 }), {
          minLength: 1,
          maxLength: 40,
        }),
        (timestamps) => {
          const emitted = ingestAll(timestamps)
          const expectedMax = Math.max(...timestamps)

          const forward = fold(emitted)
          const reversed = fold([...emitted].reverse())
          const sorted = fold(
            [...emitted].sort((a, b) => a.timestamp - b.timestamp)
          )
          const duplicated = fold([...emitted, ...emitted])

          expect(forward?.timestamp).toBe(expectedMax)
          expect(reversed?.timestamp).toBe(expectedMax)
          expect(sorted?.timestamp).toBe(expectedMax)
          expect(duplicated?.timestamp).toBe(expectedMax)
        }
      )
    )
  })

  it("emits lossy/duplicate/reordered deliveries verbatim, attempting no fix-up of its own (§8 stage separation)", () => {
    const emitted = ingestAll([5, 1, 5, 3])
    expect(emitted.map((t) => t.timestamp)).toEqual([5, 1, 5, 3])
  })
})
