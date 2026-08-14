export default function initWasm(): Promise<unknown>

export class FilterStateMachine {
  constructor(initialState: string)
  readonly state: string
  transitionTo(state: string): string
  cycle(): string
}
