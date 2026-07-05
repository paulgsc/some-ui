/**
 * Session Machine - Core Actor Implementation
 *
 * Framework-agnostic state machine
 * Can run in Node, Deno, Bun, or browser
 *
 * INVARIANTS ENFORCED:
 * - All core invariants via reducer
 * - V6: Remount stability (machine lives outside React)
 * - V12: Memory boundedness
 */

import { createInitialState, sessionReducer } from "@chat/lib/topik/core/session-reducer"
import type {
  ISessionMachine,
  SessionEffect,
  SessionEvent,
  SessionState,
} from "@chat/lib/topik/core/session-types"

// ═══════════════════════════════════════════════════════════════════════════
// SESSION MACHINE
// ═══════════════════════════════════════════════════════════════════════════

export class SessionMachine implements ISessionMachine {
  private state: SessionState
  private listeners = new Set<(state: SessionState) => void>()

  constructor(initialState?: SessionState) {
    this.state = initialState ?? createInitialState()
  }

  /**
   * Get current state (immutable)
   */
  getState(): SessionState {
    return this.state
  }

  /**
   * Dispatch event and return effects
   * V2: Pure dispatch, returns effects for runtime
   */
  dispatch(event: SessionEvent): Array<SessionEffect> {
    const before = this.state
    const { state: after, effects } = sessionReducer(before, event)

    // Only notify if state changed
    if (after !== before) {
      this.state = after
      this._notify()
    }

    // Always return effects (even if state unchanged)
    return effects
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: SessionState) => void): () => void {
    this.listeners.add(listener)

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Destroy machine
   */
  destroy(): void {
    this.listeners.clear()
  }

  /**
   * Notify all listeners
   */
  private _notify(): void {
    const state = this.state
    for (const listener of this.listeners) {
      listener(state)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create session machine
 *
 * @param repository - Topik repository instance
 * @param initialState - Optional initial state (for hydration)
 */
export function createSessionMachine(
  initialState?: SessionState
): ISessionMachine {
  return new SessionMachine(initialState)
}
