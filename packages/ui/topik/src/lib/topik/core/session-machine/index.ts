/**
 * The session actor: framework-agnostic, runs anywhere.
 *
 * INVARIANTS ENFORCED:
 * - All core invariants via reducer
 * - V6: Remount stability (machine lives outside React)
 * - V12: Memory boundedness
 */

import {
  createInitialState,
  sessionReducer,
} from "@topik/lib/topik/core/session-reducer"
import type {
  ISessionMachine,
  SessionEffect,
  SessionEvent,
  SessionState,
} from "@topik/lib/topik/core/session-types"

// SESSION MACHINE

export class SessionMachine implements ISessionMachine {
  private state: SessionState
  private listeners = new Set<(state: SessionState) => void>()

  constructor(initialState?: SessionState) {
    this.state = initialState ?? createInitialState()
  }

  getState(): SessionState {
    return this.state
  }

  /** V2: pure dispatch; returns the effects for the runtime. */
  dispatch(event: SessionEvent): Array<SessionEffect> {
    const before = this.state
    const { state: after, effects } = sessionReducer(before, event)

    if (after !== before) {
      this.state = after
      this._notify()
    }

    return effects
  }

  subscribe(listener: (state: SessionState) => void): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  destroy(): void {
    this.listeners.clear()
  }

  private _notify(): void {
    const state = this.state
    for (const listener of this.listeners) {
      listener(state)
    }
  }
}

// FACTORY

/** @param initialState - Optional initial state (for hydration) */
export function createSessionMachine(
  initialState?: SessionState
): ISessionMachine {
  return new SessionMachine(initialState)
}
