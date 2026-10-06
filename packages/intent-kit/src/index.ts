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
  ForeignCall,
  ForeignCallOptions,
  ForeignFailure,
  ForeignOutcome,
  ForeignPort,
  ForeignVerdict,
} from "./foreign"
export { callForeign, ForeignDeadlineError, reportToConsole } from "./foreign"
