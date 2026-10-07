export type { Intent, IntentArms } from "./intent"
export {
  assertNever,
  failed,
  idle,
  matchIntent,
  succeeded,
  working,
} from "./intent"

export type { IntentError, IntentErrorKind } from "./intent-error"
export { toIntentError } from "./intent-error"

export type { IntentPresentation } from "./presentation"

export type {
  FailureSink,
  ForeignCall,
  ForeignCallOptions,
  ForeignFailure,
  ForeignOutcome,
  ForeignPort,
  ForeignVerdict,
} from "./foreign"
export {
  addFailureSink,
  callForeign,
  FOREIGN_FAILURE_TAG,
  ForeignDeadlineError,
  reportFailure,
} from "./foreign"
