/**
 * Remark 3.2 (poll cadence) — canon §3.3.
 *
 * Backoff/retry policy for the Sensor's poll sub-channel (S4). Fully
 * parameterized: `some-censor`'s 500ms interval is a *consumer's* choice,
 * not transport's, so no interval is hard-coded here. `maxAttempts` is
 * mandatory — a retry sequence is always bounded, never silently infinite.
 */

export type BackoffPolicy = {
  readonly initialDelayMs: number
  readonly maxDelayMs: number
  readonly factor: number
  readonly maxAttempts: number
}

export function nextDelay(policy: BackoffPolicy, attempt: number): number {
  const delay = policy.initialDelayMs * policy.factor ** attempt
  return Math.min(delay, policy.maxDelayMs)
}

export function isExhausted(policy: BackoffPolicy, attempt: number): boolean {
  return attempt >= policy.maxAttempts
}

export type RetryState = {
  readonly attempt: number
}

export function initialRetryState(): RetryState {
  return { attempt: 0 }
}

export type RetryStep = {
  readonly state: RetryState
  readonly delayMs: number
}

/** Advances the retry sequence one step, or `undefined` once `maxAttempts` is reached — the bound is enforced here, not left to the caller. */
export function advanceRetry(
  policy: BackoffPolicy,
  state: RetryState
): RetryStep | undefined {
  if (isExhausted(policy, state.attempt)) {
    return undefined
  }
  return {
    state: { attempt: state.attempt + 1 },
    delayMs: nextDelay(policy, state.attempt),
  }
}
