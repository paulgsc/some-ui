/**
 * Runs a week's flow on the phone (RR25, #3249; RR29, #3257): where on the
 * line of steps the owner is (`lib/flow`'s `flowSteps`, one pager over all
 * of them, GES5), the academy exercise open, and the owner's marks, ticks
 * and picks, each kept as it is made (`./store`, every list only grows).
 *
 * It decides nothing the pure modules don't: `lib/flow` says what leaving a
 * step marks and where the line goes, which exercise a tick may name and
 * where a ticket opens; `lib/decisions` which pick changes a fork's
 * decision. It owns the position and the stores, and tells its host two
 * things: the ticket now on screen (`onTicket`, so the week's takes follow
 * it) and a wish to look the week over (`onReview`).
 *
 * A write the phone couldn't keep leaves the screen as it was and says so
 * (`notice`), as the week's takes do; nothing is retried behind the owner.
 */
import type { Pick as ForkPick, PickMade } from "@rust-rounds/lib/decisions"
import { pick as pickAt } from "@rust-rounds/lib/decisions"
import type {
  ExerciseTick,
  FlowStep,
  Leave,
  StepMark,
} from "@rust-rounds/lib/flow"
import {
  flowSteps,
  leave,
  openAt,
  openFor,
  tick as tickAt,
  ticked,
} from "@rust-rounds/lib/flow"
import type { Week } from "@rust-rounds/lib/formats/week"
import type { KeyedStorage } from "@some-ui/core-utils"
import { assertNever } from "@some-ui/core-utils"

import { ofWeek, weekMarks, weekPicks, weekTicks } from "./store"

export type FlowState = {
  /** The week's line of steps. */
  readonly steps: ReadonlyArray<FlowStep>
  /** Where on it the owner is. */
  readonly at: number
  /** The academy exercise open, from 1, or null for the step itself. */
  readonly exercise: number | null
  /** This week's marks, ticks and picks, as kept. */
  readonly marks: ReadonlyArray<StepMark>
  readonly ticks: ReadonlyArray<ExerciseTick>
  readonly picks: ReadonlyArray<PickMade>
  /** A change the phone couldn't keep, said over the screen. */
  readonly notice: "notKept" | null
}

type FlowEvent =
  /** A swipe, Prev or Next, or a tap on a step: moves, marks nothing. */
  | { readonly type: "go"; readonly index: number }
  /** A ticket opened from the brief: where it opens. */
  | { readonly type: "openTicket"; readonly ticket: string }
  /** The step's own way forward (`lib/flow`'s `leave`). */
  | { readonly type: "leave"; readonly how: Leave }
  /** Looking the week over, from a ticket's voice. */
  | { readonly type: "review" }
  | { readonly type: "exercise"; readonly n: number | null }
  | { readonly type: "tick"; readonly n: number }
  | { readonly type: "pick"; readonly fork: number; readonly pick: ForkPick }
  | { readonly type: "noticeDismissed" }

export type FlowPorts = {
  readonly week: Week
  readonly storage: KeyedStorage | null
  /** Milliseconds since the epoch. */
  readonly now: () => number
  /** Whether a take is said at any of `ticket`'s forks. */
  readonly said: (ticket: string) => boolean
  /** The ticket now on screen. */
  readonly onTicket: (ticket: string) => void
  readonly onReview: () => void
}

export type FlowRuntime = {
  readonly getSnapshot: () => FlowState
  readonly subscribe: (listener: () => void) => () => void
  readonly dispatch: (event: FlowEvent) => void
}

export function createFlow(ports: FlowPorts): FlowRuntime {
  const { week } = ports
  const marksKept = weekMarks(ports.storage)
  const ticksKept = weekTicks(ports.storage)
  const picksKept = weekPicks(ports.storage)
  const steps = flowSteps(week)
  const read = (): Pick<FlowState, "marks" | "ticks" | "picks"> => ({
    marks: ofWeek(marksKept.list() ?? [], week.id),
    ticks: ofWeek(ticksKept.list() ?? [], week.id),
    picks: ofWeek(picksKept.list() ?? [], week.id),
  })
  const kept = read()
  let state: FlowState = {
    steps,
    at: openAt(steps, kept.marks) ?? 0,
    exercise: null,
    notice: null,
    ...kept,
  }
  const listeners = new Set<() => void>()
  const set = (next: FlowState): void => {
    if (next === state) return
    const ticket = steps[next.at]?.ticket
    const moved = ticket !== steps[state.at]?.ticket
    state = next
    if (moved && ticket !== undefined) ports.onTicket(ticket)
    for (const listener of listeners) listener()
  }
  const now = (): string => new Date(ports.now()).toISOString()

  /**
   * Appends what `grown` adds to `list` to its store: true when kept, or
   * nothing to add.
   */
  const keep = <R>(
    store: {
      keep: (
        change: (
          all: ReadonlyArray<R & { week: string }>
        ) => ReadonlyArray<R & { week: string }>
      ) => unknown
    },
    list: ReadonlyArray<R>,
    grown: ReadonlyArray<R>
  ): boolean => {
    const added = grown.slice(list.length)
    if (grown === list || added.length === 0) return true
    return (
      store.keep((all) => [
        ...all,
        ...added.map((each) => ({ ...each, week: week.id })),
      ]) !== null
    )
  }

  const ticketAt = (): string | null => steps[state.at]?.ticket ?? null

  const leaving = (
    how: Leave
  ): { marks: ReadonlyArray<StepMark>; to: number } | null => {
    const ticket = ticketAt()
    if (ticket === null) return null
    const left = leave(
      steps,
      state.marks,
      state.at,
      how,
      { ticked: ticked(state.ticks, ticket).size, said: ports.said(ticket) },
      now()
    )
    if (!keep(marksKept, state.marks, left.marks)) {
      set({ ...state, notice: "notKept" })
      return null
    }
    return left
  }

  const dispatch = (event: FlowEvent): void => {
    switch (event.type) {
      case "go": {
        if (event.index < 0 || event.index >= steps.length) return
        if (event.index === state.at && state.exercise === null) return
        set({ ...state, at: event.index, exercise: null })
        return
      }
      case "openTicket": {
        const to = openFor(steps, state.marks, event.ticket)
        if (to !== null) set({ ...state, at: to, exercise: null })
        // The ticket is on screen now, even where the line hasn't moved.
        ports.onTicket(event.ticket)
        return
      }
      case "leave": {
        const left = leaving(event.how)
        if (left !== null) {
          set({ ...state, marks: left.marks, at: left.to, exercise: null })
        }
        return
      }
      case "review": {
        const left = leaving("onward")
        if (left === null) return
        set({ ...state, marks: left.marks })
        ports.onReview()
        return
      }
      case "exercise": {
        set({ ...state, exercise: event.n })
        return
      }
      case "tick": {
        const ticket = ticketAt()
        if (ticket === null) return
        const grown = tickAt(week, state.ticks, {
          ticket,
          exercise: event.n,
          at: now(),
        })
        if (grown === state.ticks) return
        if (!keep(ticksKept, state.ticks, grown)) {
          set({ ...state, notice: "notKept" })
          return
        }
        set({ ...state, ticks: grown })
        return
      }
      case "pick": {
        const ticket = ticketAt()
        if (ticket === null) return
        const grown = pickAt(week, state.picks, {
          ticket,
          fork: event.fork,
          pick: event.pick,
          at: now(),
        })
        if (grown === state.picks) return
        if (!keep(picksKept, state.picks, grown)) {
          set({ ...state, notice: "notKept" })
          return
        }
        set({ ...state, picks: grown })
        return
      }
      case "noticeDismissed": {
        set({ ...state, notice: null })
        return
      }
      default: {
        assertNever(event)
      }
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    dispatch,
  }
}
