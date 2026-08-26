import { shuffledBySeed } from "@leetype/lib/leetype/deterministic-random"

/**
 * The session's exercise order.
 *
 * The permutation comes from the package's shared deterministic generator
 * (`lib/leetype/deterministic-random`) rather than `Math.random`, so a
 * session can be replayed from its seed — in a test, a story, or a bug
 * report. That generator used to be private to this module; it moved out
 * when the mobile reading path needed the same replay property for its own
 * ordering (LTY-MOBILE), and nothing about the schedule's behaviour changed
 * in the move.
 */
export type ExerciseSchedule = {
  readonly seed: number
  readonly cycle: number
  readonly order: ReadonlyArray<string>
  readonly cursor: number
}

function cycleSeed(seed: number, cycle: number): number {
  return (seed ^ Math.imul(cycle + 1, 0x9e3779b9)) >>> 0
}

function orderForCycle(
  exerciseIds: ReadonlyArray<string>,
  seed: number,
  cycle: number,
  previousId?: string
): Array<string> {
  const order = shuffledBySeed(exerciseIds, cycleSeed(seed, cycle))
  if (order.length > 1 && order[0] === previousId) {
    const first = order[0]!
    order[0] = order[1]!
    order[1] = first
  }
  return order
}

export function createExerciseSchedule(
  exerciseIds: ReadonlyArray<string>,
  seed: number
): ExerciseSchedule {
  if (exerciseIds.length === 0) {
    throw new Error("Cannot schedule an empty exercise corpus.")
  }
  return {
    seed: seed >>> 0,
    cycle: 0,
    order: orderForCycle(exerciseIds, seed, 0),
    cursor: 0,
  }
}

export type ScheduledExercise = {
  readonly exerciseId: string
  readonly schedule: ExerciseSchedule
}

/**
 * Consume one item from a cyclic Fisher–Yates shuffle bag.
 *
 * Every eligible id occurs exactly once per cycle. A new cycle is shuffled
 * only after the old one is exhausted, and its first item cannot immediately
 * repeat the preceding cycle's last item when another choice exists.
 */
export function takeScheduledExercise(
  exerciseIds: ReadonlyArray<string>,
  schedule: ExerciseSchedule
): ScheduledExercise {
  if (exerciseIds.length === 0) {
    throw new Error("Cannot schedule an empty exercise corpus.")
  }

  if (schedule.cursor < schedule.order.length) {
    return {
      exerciseId: schedule.order[schedule.cursor]!,
      schedule: { ...schedule, cursor: schedule.cursor + 1 },
    }
  }

  const previousId = schedule.order.at(-1)
  const cycle = schedule.cycle + 1
  const order = orderForCycle(exerciseIds, schedule.seed, cycle, previousId)
  return {
    exerciseId: order[0]!,
    schedule: { ...schedule, cycle, order, cursor: 1 },
  }
}
