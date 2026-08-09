/**
 * The shared fixture for #939: sabotage `global.fetch` in each of the four
 * modes `lib/file-host-config/client.ts` already normalizes (three) plus the
 * one it doesn't (a hang past whatever timeout the caller assumes exists —
 * there isn't one).
 *
 * ## Why this is Vitest against real components, not a Playwright suite
 * booting the real app
 *
 * #939 asks for `apps/www/tests/intent/*.spec.ts` — Playwright, screenshots,
 * a stopped `file_host` process. That assumes an app-boot harness (a
 * `webServer`, or a bundled entry point a browser can load) that does not
 * exist anywhere in this monorepo today: every existing Playwright spec
 * (`tests/{csp,dialog-overlay,session-viewport}`) deliberately does *not*
 * boot the real app — see their own header comments — and `tests/study-nudge`
 * boots a throwaway static-asset server, not a bundled React tree. Building
 * that harness from nothing is a real, separately-sized infrastructure
 * project, and #934's own non-goals rule out exactly that kind of new
 * infrastructure for an evidence-gathering epic.
 *
 * What's here instead: the real production components (`SessionComposer`,
 * the sessions list), the real hooks (`lib/tenant/hooks.ts`), the real
 * `file-host-config/client.ts` error normalization, rendered through
 * `@testing-library/react` (already a workspace devDependency, already used
 * for component tests in this app — see `activity-maturity.test.tsx`) with
 * only `global.fetch` replaced. Assertions read the DOM the way a person
 * would (`screen.getByRole`, visible text), not implementation details like
 * whether `onError` fired — the thing #939 explicitly warns a narrower unit
 * test would get wrong. The gap this leaves — a real browser, a real
 * network stack, a stopped `file_host` process — is real and is recorded as
 * a gap in `docs/intent-census.md` rather than papered over.
 */

// This module is test-only support code (never imported by production
// source) but doesn't itself match the repo's *.test.*/tests/** glob that
// exempts this rule; see packages/eslint/src/configs/overrides-deps.config.ts.
// eslint-disable-next-line import/no-extraneous-dependencies
import { waitFor } from "@testing-library/react"
// eslint-disable-next-line import/no-extraneous-dependencies
import { expect, vi } from "vitest"

export type SabotageMode =
  | "connection-refused"
  | "not-configured"
  | "response-error"
  | "hang"

/** file_host's own error envelope; see client.ts's `errorCodeOf`. */
function errorEnvelope(code: string, message: string): string {
  return JSON.stringify({ error: { code, message } })
}

function assertNever(mode: never): never {
  throw new Error(`unhandled sabotage mode: ${String(mode)}`)
}

/**
 * Installs a `global.fetch` stub for one sabotage mode. Callers install this
 * *after* the component under test has already rendered and settled its
 * incidental startup queries (the sessions list, the migration check) — the
 * point is to fail the request the user's own click makes, not every
 * request the module graph happens to issue on import.
 */
export function installFileHostSabotage(mode: SabotageMode): () => void {
  const impl = ((): typeof fetch => {
    switch (mode) {
      case "connection-refused": {
        // What a real browser's fetch rejects with when nothing is
        // listening — createFileHostTransport wraps this as
        // FileHostUnreachableError.
        return vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
      }
      case "not-configured": {
        return vi.fn(() =>
          Promise.resolve(
            new Response(
              errorEnvelope("feature_not_configured", "no VAPID identity"),
              {
                status: 503,
              }
            )
          )
        )
      }
      case "response-error": {
        return vi.fn(() =>
          Promise.resolve(
            new Response(errorEnvelope("internal_error", "boom"), {
              status: 500,
            })
          )
        )
      }
      case "hang": {
        // Never settles - client.ts has no timeout of its own, so this is
        // the "stuck forever" case rather than a slow-but-eventual one.
        return vi.fn(() => new Promise<Response>(() => {}))
      }
      default: {
        return assertNever(mode)
      }
    }
  })()

  vi.stubGlobal("fetch", impl)
  return () => vi.unstubAllGlobals()
}

/** All four sabotage modes, for `describe.each`. */
export const SABOTAGE_MODES: ReadonlyArray<SabotageMode> = [
  "connection-refused",
  "not-configured",
  "response-error",
  "hang",
]

/** Pre-#936: failed for every intent this census found, since nothing
 * rendered a failure at all. #936 makes this assertion pass for every
 * migrated call site - see each `*.intent.test.tsx`'s own header for which
 * of its `it.fails` wrappers that has already flipped to a plain `it`.
 *
 * Two things this checks, not one: `role="alert"`/`role="status"` are what
 * `IntentFailure`/`AmbientIntentStatus` actually render (see
 * `lib/intent/render`), and are checked first since they're what a real
 * failure now looks like; the keyword regex stays as a fallback for
 * anything that names a failure without going through either renderer.
 *
 * Polls via `waitFor` rather than awaiting one fixed microtask tick - the
 * real mutation pipeline a `fireEvent.click` sets off (`useIntent`'s
 * `start` -> TanStack's `mutate` -> the sessions repository's `fetch` ->
 * file_host's own error normalization -> TanStack's notify queue ->
 * React's own state update) does not resolve in a fixed number of
 * microtask turns, and asserting after exactly one was an intermittent
 * false negative waiting to happen, not a stable wait. */
export async function expectSomeFailureAffordance(
  container: HTMLElement
): Promise<void> {
  const failureText = /error|fail|couldn.?t|try again|retry|went wrong/i
  await waitFor(() => {
    const roleMatch = container.querySelector('[role="alert"], [role="status"]')
    const textMatch = Array.from(container.querySelectorAll("*")).find(
      (el) =>
        el.textContent &&
        failureText.test(el.textContent) &&
        el.children.length === 0
    )
    expect(
      roleMatch ?? textMatch,
      "expected some element naming the failure, found none"
    ).toBeTruthy()
  })
}
