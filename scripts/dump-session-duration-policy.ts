/**
 * Emits `DEFAULT_SESSION_DURATION_POLICY`
 * (`apps/www/src/lib/session-duration-policy/index.ts`) as JSON on stdout.
 *
 * Mirrors `dump-activity-catalog.ts` in this same directory, for the same
 * reason: the server transcribes this policy's two constants
 * (`activity_repo::provisioning::CLIENT_MIN_ACTIVITY_DURATION_MS`/
 * `CLIENT_MAX_TOTAL_DURATION_MS`, `paulgsc/server#281`) rather than
 * importing TypeScript, and a transcription with no way to notice drift is
 * not a citation, it is a hope. This gives the server something to diff its
 * transcription against instead of trusting it silently.
 *
 * Usage:
 *
 *   pnpm dump:session-duration-policy > session-duration-policy.snapshot.json
 *
 * Then copy the file by hand into
 * `paulgsc/server@crates/db/activity/testdata/session_duration_policy.snapshot.json`.
 * Same by-hand discipline `dump-activity-catalog.ts` and
 * `packages/contract-harness/routes.server.json` already run on -- see
 * `dump-activity-catalog.ts`'s own comment for why nothing automates this
 * bridge yet.
 *
 * The policy lives inside `apps/www`'s own source tree, not a shared
 * package, so there is no workspace alias to reach it through -- a
 * script that runs once, by hand, to regenerate one fixture does not
 * justify adding one just to satisfy this rule.
 */
// eslint-disable-next-line no-restricted-imports -- see comment above
import { DEFAULT_SESSION_DURATION_POLICY } from "../apps/www/src/lib/session-duration-policy/index.ts"

process.stdout.write(
  `${JSON.stringify(DEFAULT_SESSION_DURATION_POLICY, null, 2)}\n`
)
