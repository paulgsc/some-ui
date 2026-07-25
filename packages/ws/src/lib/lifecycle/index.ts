/**
 * Lifecycle state machine for WebSocket connections
 */
export type LifecycleState =
  | "idle"
  | "initializing"
  | "initialized"
  | "disposing"

export class LifecycleStateMachine {
  private state: LifecycleState = "idle"

  get current(): LifecycleState {
    return this.state
  }

  canTransitionTo(target: LifecycleState): boolean {
    const transitions: Record<LifecycleState, Array<LifecycleState>> = {
      idle: ["initializing", "disposing"],
      initializing: ["initialized", "disposing", "idle"],
      initialized: ["disposing"],
      disposing: ["idle"],
    }

    return transitions[this.state].includes(target)
  }

  transitionTo(target: LifecycleState): void {
    if (!this.canTransitionTo(target)) {
      throw new Error(
        `Invalid lifecycle transition: ${this.state} -> ${target}`
      )
    }
    this.state = target
  }

  is(state: LifecycleState): boolean {
    return this.state === state
  }

  isOneOf(...states: Array<LifecycleState>): boolean {
    return states.includes(this.state)
  }

  reset(): void {
    this.state = "idle"
  }
}
