import { describe, expect, it } from "vitest"

import type { Action } from "../contracts/action"
import type { Adapter } from "../contracts/adapter"
import type { Hypothesis } from "../contracts/hypothesis"
import { invoke } from "./invoke"
import { createNullAdapter } from "./null-adapter"

type Attrs = { readonly seq: number }

function throwingHypothesis<K, Attr>(): Hypothesis<K, Attr> {
  const target: Hypothesis<K, Attr> = {
    get: () => undefined,
    has: () => false,
    keys: () => [],
  }
  return new Proxy(target, {
    get(_target, prop): never {
      throw new Error(`invoke() touched Hypothesis.${String(prop)} directly`)
    },
  })
}

describe("adapter/invoke — the sole runtime call site for a concrete adapter", () => {
  it("forwards the hypothesis to the adapter's decide() and returns its result verbatim", () => {
    const expected: ReadonlyArray<Action> = [{ kind: "noop" }]
    const adapter: Adapter<string, Attrs> = {
      decide: () => expected,
    }
    const hypothesis: Hypothesis<string, Attrs> = {
      get: () => undefined,
      has: () => false,
      keys: () => [],
    }

    const result = invoke(hypothesis, adapter)

    expect(result).toBe(expected)
  })

  it("never dereferences the hypothesis itself — invoke() only passes the reference through to the adapter", () => {
    const adapter = createNullAdapter<string, Attrs>()
    const hypothesis = throwingHypothesis<string, Attrs>()

    expect(() => invoke(hypothesis, adapter)).not.toThrow()
  })

  it("passes the exact hypothesis reference through — an adapter that does call into it sees the same object", () => {
    const hypothesis: Hypothesis<string, Attrs> = {
      get: () => ({ seq: 1 }),
      has: () => true,
      keys: () => ["k"],
    }
    let seen: Hypothesis<string, Attrs> | undefined
    const adapter: Adapter<string, Attrs> = {
      decide: (h) => {
        seen = h
        return []
      },
    }

    invoke(hypothesis, adapter)

    expect(seen).toBe(hypothesis)
  })
})
