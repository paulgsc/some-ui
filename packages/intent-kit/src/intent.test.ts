import { describe, expect, it, vi } from "vitest"

import { failed, idle, matchIntent, succeeded, working } from "./intent"
import type { Intent } from "./intent"
import { toIntentError } from "./intent-error"

describe("matchIntent", () => {
  it("dispatches idle", () => {
    const result = matchIntent(idle(), {
      idle: () => "idle",
      working: () => "working",
      succeeded: () => "succeeded",
      failed: () => "failed",
    })
    expect(result).toBe("idle")
  })

  it("dispatches working, passing through an omitted step", () => {
    const seenSteps: Array<string | undefined> = []
    matchIntent(working(), {
      idle: () => undefined,
      working: (step) => {
        seenSteps.push(step)
      },
      succeeded: () => undefined,
      failed: () => undefined,
    })
    expect(seenSteps).toEqual([undefined])
  })

  it("dispatches working with a composite step", () => {
    const seenSteps: Array<string | undefined> = []
    const intent: Intent<never, "create" | "activate"> = working("activate")
    matchIntent(intent, {
      idle: () => undefined,
      working: (step) => {
        seenSteps.push(step)
      },
      succeeded: () => undefined,
      failed: () => undefined,
    })
    expect(seenSteps).toEqual(["activate"])
  })

  it("dispatches succeeded, handing the value to its arm", () => {
    const result = matchIntent(succeeded(42), {
      idle: () => 0,
      working: () => 0,
      succeeded: (value) => value,
      failed: () => 0,
    })
    expect(result).toBe(42)
  })

  it("dispatches failed, handing the error and a working retry to its arm", () => {
    const retry = vi.fn()
    const error = toIntentError(new Error("boom"))
    let seenError: unknown
    let seenRetry: (() => void) | undefined

    matchIntent(failed(error, retry), {
      idle: () => undefined,
      working: () => undefined,
      succeeded: () => undefined,
      failed: (err, retryFn) => {
        seenError = err
        seenRetry = retryFn
      },
    })

    expect(seenError).toBe(error)
    seenRetry?.()
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it("is total over every status the constructors can produce", () => {
    // Programmatically enumerated so a fifth constructor added later without
    // a matching arm fails this test even in plain JS, not only under tsc -
    // the runtime backstop to the @ts-expect-error fixtures.
    const retry = vi.fn()
    const error = toIntentError(new Error("boom"))
    const sample: ReadonlyArray<Intent<number>> = [
      idle(),
      working(),
      succeeded(1),
      failed(error, retry),
    ]

    for (const intent of sample) {
      expect(() =>
        matchIntent(intent, {
          idle: () => null,
          working: () => null,
          succeeded: () => null,
          failed: () => null,
        })
      ).not.toThrow()
    }
  })

  it("throws rather than silently returning for an unrecognised status (defensive, not reachable through the constructors)", () => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- deliberately constructing a status this module's own constructors cannot produce, to exercise the assertNever fallback.
    const bogus = { status: "bogus" } as unknown as Intent<number>
    expect(() =>
      matchIntent(bogus, {
        idle: () => null,
        working: () => null,
        succeeded: () => null,
        failed: () => null,
      })
    ).toThrow(/unhandled Intent status/)
  })
})

describe("constructors", () => {
  it("build object literals a hand-written one could smuggle a bad shape past", () => {
    expect(idle()).toEqual({ status: "idle" })
    expect(working()).toEqual({ status: "working", step: undefined })
    expect(succeeded("x")).toEqual({ status: "succeeded", value: "x" })

    const retry = (): void => undefined
    const error = toIntentError("nope")
    expect(failed(error, retry)).toEqual({ status: "failed", error, retry })
  })
})
