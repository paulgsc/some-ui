/**
 * The tap on Run it again (RETRY), as a state and a pure `step`, and the
 * runtime that owns the one ask to home (R1, `docs/monorepo-boundaries.md`):
 * the page reads a snapshot and dispatches. One ask at a time: a tap while
 * one is out is dropped, and an answer that lands after the page went is
 * never said.
 */
import { assertNever } from "@some-ui/core-utils"

import type { Board } from "@/lib/renders/model"

import type { AgainAnswer, Step } from "./model"
import { follow } from "./model"

/** Whether two steps say the same, so a read that moved nothing changes nothing. */
const sameStep = (a: Step, b: Step): boolean =>
  a.state === b.state &&
  a.askedAt === b.askedAt &&
  a.startedAt === b.startedAt &&
  a.endedAt === b.endedAt &&
  a.reason === b.reason &&
  a.items.join("\n") === b.items.join("\n")

/** What the last tap came to, said in a Notice. */
export type Said =
  | { readonly kind: "answer"; readonly answer: AgainAnswer }
  | { readonly kind: "away" }
  | { readonly kind: "busy" }
  | { readonly kind: "unpaired" }

export type AgainState =
  | { readonly kind: "idle" }
  /** `at`: when the tap was, Unix seconds, the run's start where home names none. */
  | { readonly kind: "asking"; readonly at: number; readonly target: Target }
  | {
      readonly kind: "said"
      readonly said: Said
      readonly at: number
      readonly target: Target
    }

/** Which render a tap asks home to run again. */
export type Target = {
  readonly feed: string
  readonly key: string
  /** When the failure it runs again was, as the board listed it. */
  readonly stoppedAt?: number | undefined
}

export type AgainEvent =
  | { readonly type: "tap"; readonly target: Target; readonly at: number }
  | { readonly type: "answered"; readonly said: Said }
  | { readonly type: "dismissed" }
  /**
   * The board was read: a step being followed moves by it, keeping every
   * time an earlier read gave (`follow`).
   */
  | { readonly type: "board"; readonly board: Board }

export const IDLE: AgainState = { kind: "idle" }

export function step(state: AgainState, event: AgainEvent): AgainState {
  switch (event.type) {
    case "tap": {
      return state.kind === "asking"
        ? state
        : { kind: "asking", at: event.at, target: event.target }
    }
    case "answered": {
      return state.kind === "asking"
        ? { kind: "said", said: event.said, at: state.at, target: state.target }
        : state
    }
    case "dismissed": {
      return state.kind === "said" ? IDLE : state
    }
    case "board": {
      if (state.kind !== "said" || state.said.kind !== "answer") return state
      const answer = state.said.answer
      if (answer.kind !== "step") return state
      const { feed, key, stoppedAt } = state.target
      const next = follow(
        answer.step,
        event.board,
        feed,
        key,
        state.at,
        stoppedAt
      )
      return sameStep(next, answer.step)
        ? state
        : {
            ...state,
            said: { kind: "answer", answer: { kind: "step", step: next } },
          }
    }
    default: {
      return assertNever(event)
    }
  }
}

/** Whether a tap's answer may have moved the row, so the board is read again. */
export const moved = (said: Said): boolean =>
  said.kind === "answer" && said.answer.kind === "step"

export type AgainPorts = {
  /** One ask of home to run `target` again; never rejects. */
  readonly ask: (target: Target) => Promise<Said>
  /** Reads the board (and the takes needing attention) again. */
  readonly readAgain: () => void
  /** The clock, Unix seconds; the phone's own when absent. */
  readonly now?: (() => number) | undefined
}

export type AgainRuntime = {
  readonly subscribe: (listener: () => void) => () => void
  readonly getSnapshot: () => AgainState
  readonly dispatch: (
    event:
      | Omit<Extract<AgainEvent, { type: "tap" }>, "at">
      | Extract<AgainEvent, { type: "dismissed" | "board" }>
  ) => void
  /** Starts the runtime; the returned call ends it, and a later answer is dropped. */
  readonly attach: () => () => void
}

export function createAgain(ports: AgainPorts): AgainRuntime {
  let state: AgainState = IDLE
  let live = false
  const listeners = new Set<() => void>()
  const set = (next: AgainState): void => {
    if (next === state) return
    state = next
    for (const listener of listeners) listener()
  }
  const settle = (said: Said): void => {
    if (!live) return
    set(step(state, { type: "answered", said }))
    if (moved(said)) ports.readAgain()
  }
  return {
    subscribe: (listener) => {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    getSnapshot: (): AgainState => state,
    dispatch: (event): void => {
      // Nothing is asked of a page not attached (gone, or not yet there).
      if (event.type === "tap" && !live) return
      const before = state
      const now = ports.now ?? ((): number => Math.floor(Date.now() / 1000))
      set(step(state, event.type === "tap" ? { ...event, at: now() } : event))
      if (event.type === "tap" && before.kind !== "asking") {
        void ports.ask(event.target).then(settle)
      }
    },
    attach: (): (() => void) => {
      live = true
      return () => {
        live = false
      }
    },
  }
}
