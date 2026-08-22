import type { Exercise } from "@leetype/types/exercise"
import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { useExerciseRunner } from "."

function exerciseOf(stepCount: number, id = "e"): Exercise {
  return {
    id,
    title: "Three steps",
    steps: Array.from({ length: stepCount }, (_, index) => ({
      id: `s${index}`,
      goal: `Step ${index}.`,
      concepts: [],
      blocks: [
        { kind: "prompt" as const, lines: [`Prompt ${index}`] },
        {
          kind: "typing" as const,
          source: `let x${index} = 1;`,
          language: "rust" as const,
        },
      ],
    })),
  }
}

describe("useExerciseRunner", () => {
  it("starts on the first step", () => {
    const { result } = renderHook(() => useExerciseRunner(exerciseOf(3)))
    expect(result.current.index).toBe(0)
    expect(result.current.total).toBe(3)
    expect(result.current.step.id).toBe("s0")
    expect(result.current.isFinished).toBe(false)
  })

  it("advances in order and reports completion once", () => {
    const { result } = renderHook(() => useExerciseRunner(exerciseOf(3)))

    act(() => result.current.advance("advance"))
    expect(result.current.step.id).toBe("s1")

    act(() => result.current.advance("advance"))
    expect(result.current.step.id).toBe("s2")
    expect(result.current.isFinished).toBe(false)

    act(() => result.current.advance("advance"))
    expect(result.current.isFinished).toBe(true)
    expect(result.current.completed).toBe(3)
  })

  it("does not advance while the predicate says repeat", () => {
    const { result } = renderHook(() => useExerciseRunner(exerciseOf(3)))

    act(() => result.current.advance("repeat"))
    expect(result.current.step.id).toBe("s0")
    expect(result.current.attempt).toBe(1)

    act(() => result.current.advance("repeat"))
    expect(result.current.step.id).toBe("s0")
    expect(result.current.attempt).toBe(2)
  })

  it("clears the attempt counter once the step is left behind", () => {
    const { result } = renderHook(() => useExerciseRunner(exerciseOf(3)))

    act(() => result.current.advance("repeat"))
    act(() => result.current.advance("advance"))

    expect(result.current.step.id).toBe("s1")
    expect(result.current.attempt).toBe(0)
  })

  it("counts an escape as progress, and records that it happened", () => {
    // The gate's repeat cap letting a player past is not the same event as
    // clearing the step, and the results surface says which it was.
    const { result } = renderHook(() => useExerciseRunner(exerciseOf(3)))

    act(() => result.current.advance("repeat"))
    act(() => result.current.advance("escape"))

    expect(result.current.step.id).toBe("s1")
    expect(result.current.escaped).toBe(1)
  })

  it("restarts to the first step with the counters cleared", () => {
    const { result } = renderHook(() => useExerciseRunner(exerciseOf(3)))

    act(() => result.current.advance("escape"))
    act(() => result.current.advance("repeat"))
    act(() => result.current.restart())

    expect(result.current.index).toBe(0)
    expect(result.current.attempt).toBe(0)
    expect(result.current.escaped).toBe(0)
    expect(result.current.isFinished).toBe(false)
  })

  it("starts at the first step when the session selects another exercise", () => {
    const { result, rerender } = renderHook(
      ({ exercise }) => useExerciseRunner(exercise),
      { initialProps: { exercise: exerciseOf(3, "first") } }
    )

    act(() => result.current.advance("escape"))
    act(() => result.current.advance("repeat"))
    rerender({ exercise: exerciseOf(2, "second") })

    expect(result.current.exercise.id).toBe("second")
    expect(result.current.index).toBe(0)
    expect(result.current.attempt).toBe(0)
    expect(result.current.escaped).toBe(0)
  })

  it("holds no typing state — swapping the source touches only its input", () => {
    // The architectural claim, asserted rather than described: everything the
    // runner reports is a function of the exercise and the advance calls, so
    // a different exercise is a different runner and nothing else changes.
    const first = renderHook(() => useExerciseRunner(exerciseOf(2)))
    const second = renderHook(() => useExerciseRunner(exerciseOf(5)))

    expect(Object.keys(first.result.current).sort()).toEqual(
      Object.keys(second.result.current).sort()
    )
    expect(first.result.current.total).toBe(2)
    expect(second.result.current.total).toBe(5)
  })
})
