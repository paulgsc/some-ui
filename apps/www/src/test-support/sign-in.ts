/**
 * Put a test's learner on the account, as a person who signed in is.
 *
 * Learning on the device is the default (`lib/authority`), and it never
 * touches `file_host`. A suite that exercises how the app copes with the
 * account's store failing (`test-support/file-host-sabotage`) is about the
 * account, so it starts from an account: call this before rendering, not after,
 * because a change of authority clears what was already fetched.
 */
import { authority } from "@/lib/authority"

export function signInForTests(): void {
  authority.resetForTests()
  authority.dispatch({ type: "session-started", adopt: true })
}
