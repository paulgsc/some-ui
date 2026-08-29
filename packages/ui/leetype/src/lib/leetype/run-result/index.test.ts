import type {
  ElapsedMs,
  ExecutionError,
  ExecutionObservation,
  RunResult,
} from "@leetype/lib/leetype/run-result"
import {
  compareElapsedToWallClockBudget,
  elapsedMs,
} from "@leetype/lib/leetype/run-result"
import { describe, expect, it } from "vitest"

describe("elapsedMs — construction (Def. 4.1)", () => {
  it("accepts a non-negative finite millisecond count", () => {
    expect(elapsedMs(0)).toEqual({ milliseconds: 0 })
    expect(elapsedMs(12.5)).toEqual({ milliseconds: 12.5 })
  })

  it("rejects a negative value", () => {
    expect(() => elapsedMs(-1)).toThrow(/non-negative/)
  })

  it("rejects a non-finite value", () => {
    expect(() => elapsedMs(Number.POSITIVE_INFINITY)).toThrow(/finite/)
    expect(() => elapsedMs(Number.NaN)).toThrow(/finite/)
  })

  it("a raw number is not an ElapsedMs without going through the constructor", () => {
    // @ts-expect-error — ElapsedMs is a wrapper object; assigning a raw number is a type error.
    const raw: ElapsedMs = 42
    expect(raw).toBe(42)
  })
})

describe("RunResult — the shape of Def. 4.1", () => {
  it("an ok result carries an observation and the input size it ran at", () => {
    const observation: ExecutionObservation = {
      output: "6",
      logs: ["compiled", "ran"],
      elapsed: elapsedMs(4),
    }
    const result: RunResult = { kind: "ok", inputSize: 10, observation }
    expect(result).toEqual({
      kind: "ok",
      inputSize: 10,
      observation: {
        output: "6",
        logs: ["compiled", "ran"],
        elapsed: { milliseconds: 4 },
      },
    })
  })

  it("distinguishes compile, runtime, and budget-exceeded failures (Def. 4.1, Def. 8.1.2)", () => {
    const classes: ReadonlyArray<ExecutionError["errorClass"]> = [
      "compile",
      "runtime",
      "budget-exceeded",
    ]
    for (const errorClass of classes) {
      const error: ExecutionError = { errorClass, message: "detail" }
      const result: RunResult = { kind: "error", inputSize: 1000, error }
      expect(result).toEqual({ kind: "error", inputSize: 1000, error })
    }
  })
})

describe("compareElapsedToWallClockBudget — the one comparison Ax. 3.1 permits", () => {
  it("is 'within' at or under the wall-clock figure", () => {
    expect(compareElapsedToWallClockBudget(elapsedMs(100), 100)).toBe("within")
    expect(compareElapsedToWallClockBudget(elapsedMs(50), 100)).toBe("within")
  })

  it("is 'exceeded' over the wall-clock figure", () => {
    expect(compareElapsedToWallClockBudget(elapsedMs(101), 100)).toBe(
      "exceeded"
    )
  })
})
