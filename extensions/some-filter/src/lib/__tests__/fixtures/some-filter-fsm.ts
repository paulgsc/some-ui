export default async function initWasm(): Promise<void> {}

export class FilterStateMachine {
  state: string

  constructor(state: string) {
    this.state = state
  }

  transitionTo(state: string): string {
    this.state = state
    return state
  }

  cycle(): string {
    const transitions: Record<string, string> = {
      auto: "off",
      off: "legacy",
      legacy: "auto",
    }
    this.state = transitions[this.state] ?? "auto"
    return this.state
  }
}
