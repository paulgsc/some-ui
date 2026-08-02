import { useCallback, useMemo, useState } from "react"
import type { Exercise, Step } from "@leetype/types/exercise"
import type { Progression } from "@leetype/types/leetype"

/**
 * Step sequencing, and nothing else.
 *
 * # The boundary this hook exists to draw
 *
 * ```text
 * Exercise engine        (which step, and when to advance)
 *       ↓  a TypingBlock's source
 * Typing engine          (slots, caret, WPM, reveal)
 *       ↓  projections
 * CodeDisplay
 * ```
 *
 * The typing engine must never know why a snippet exists, what it is
 * proving, which exercise it came from, or what corpus produced it. It takes
 * a string and reports finished / mistake / caret moved. This hook
 * orchestrates — the way a scene owns dialogue and puzzle without either
 * knowing the other.
 *
 * It holds **no typing state**. No caret, no WPM, no reveal window, no
 * keystrokes. If a field of that kind ever appears here, the boundary has
 * moved and `Leetype` is on its way back to being the 542-line component
 * this replaced.
 */

/**
 * A step, plus where it sits.
 *
 * `attempt` is threaded through because a repeat is not the same as a first
 * pass: the engine shortens the reveal delay on a retry, and the renderer
 * has to remount the same source without treating it as a step change.
 */
export type RunnerPosition = {
  step: Step
  index: number
  total: number
  /** Zero-based; non-zero means the gate held and this step came round again. */
  attempt: number
}

export type ExerciseRunner = RunnerPosition & {
  exercise: Exercise
  /** Every step, for the rail. */
  steps: ReadonlyArray<Step>
  /** Steps the player has left behind, whether cleared or escaped. */
  completed: number
  /** Steps the gate let through only because the attempts ran out. */
  escaped: number
  /** True once the last step has been left behind. */
  isFinished: boolean
  /**
   * Leave the current step, if the predicate lets you.
   *
   * The decision is **asked for, not assumed**: the runner hands the
   * predicate the finished step and does what it says. Until the gate
   * landed, that predicate was "is it complete"; now it is weighted WPM
   * against the player's baseline. One call site either way — which is the
   * whole point of the seam.
   */
  advance: (progression: Progression) => void
  restart: () => void
}

type RunnerState = {
  index: number
  attempt: number
  escaped: number
}

const START: RunnerState = { index: 0, attempt: 0, escaped: 0 }

export function useExerciseRunner(exercise: Exercise): ExerciseRunner {
  const [state, setState] = useState<RunnerState>(START)

  const total = exercise.steps.length
  // An exercise is non-empty by schema; clamping rather than indexing
  // blindly keeps a corpus that slipped past validation from rendering
  // `undefined` as a step.
  const index = Math.min(state.index, Math.max(total - 1, 0))
  const step = exercise.steps[index]

  const advance = useCallback((progression: Progression): void => {
    setState((current) => {
      if (progression === "repeat") {
        return { ...current, attempt: current.attempt + 1 }
      }
      return {
        index: current.index + 1,
        attempt: 0,
        escaped: current.escaped + (progression === "escape" ? 1 : 0),
      }
    })
  }, [])

  const restart = useCallback((): void => {
    setState(START)
  }, [])

  return useMemo(
    (): ExerciseRunner => ({
      exercise,
      steps: exercise.steps,
      // The clamp above means `step` is defined for any non-empty exercise;
      // the fallback is a type-level necessity, not a reachable state.
      step: step ?? EMPTY_STEP,
      index,
      total,
      attempt: state.attempt,
      completed: Math.min(state.index, total),
      escaped: state.escaped,
      isFinished: state.index >= total,
      advance,
      restart,
    }),
    [
      exercise,
      step,
      index,
      total,
      state.index,
      state.attempt,
      state.escaped,
      advance,
      restart,
    ]
  )
}

/**
 * The step a runner reports for an exercise the schema should have rejected.
 * Renders as an empty card rather than crashing the activity.
 */
const EMPTY_STEP: Step = {
  id: "empty",
  goal: "",
  blocks: [{ kind: "typing", source: " ", language: "rust" }],
  concepts: [],
}
