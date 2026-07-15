type IdleState = {
  status: "IDLE"
  code: undefined
  error: undefined
  attempt: number
}

type LoadingState = {
  status: "LOADING"
  code: undefined
  error: undefined
  attempt: number
}

type SuccessState = {
  status: "SUCCESS"
  code: string // The formatted code
  error: undefined
}

type ErrorState = {
  status: "ERROR"
  code: undefined
  error: Error // The error object
}

// Discriminated Union for the FSM
export type FormattedCodeState =
  | IdleState
  | LoadingState
  | SuccessState
  | ErrorState
