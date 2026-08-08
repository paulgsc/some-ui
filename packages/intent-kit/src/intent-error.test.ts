import { describe, expect, it } from "vitest"

import { toIntentError } from "./intent-error"

describe("toIntentError", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "network exploded"],
    ["a number", 42],
    ["a plain object", { message: "not an Error instance" }],
    ["a real Error", new Error("boom")],
    [
      "a DOMException (an aborted fetch)",
      new DOMException("aborted", "AbortError"),
    ],
    ["an array", [1, 2, 3]],
  ])(
    "never throws for %s, and returns a valid IntentError",
    (_label, input): void => {
      const result = toIntentError(input)

      expect(result.kind).toBe("unknown")
      expect(result.retryable).toBe(true)
      expect(typeof result.summary).toBe("string")
      expect(result.summary.length).toBeGreaterThan(0)
      // cause is required, and is the original value untouched - the
      // diagnostic channel this vocabulary exists to keep separate from the
      // one a person actually sees.
      expect(result.cause).toBe(input)
    }
  )

  it("is total: calling it in a loop over an adversarial input set never throws", () => {
    const adversarial: ReadonlyArray<unknown> = [
      undefined,
      null,
      0,
      Number.NaN,
      "",
      Symbol("x"),
      new Response(null, { status: 500 }),
      (): never => {
        throw new Error("should never be called")
      },
    ]

    for (const input of adversarial) {
      expect(() => toIntentError(input)).not.toThrow()
    }
  })
})
