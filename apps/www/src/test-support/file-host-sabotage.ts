/**
 * Sabotage `global.fetch` in each of the four failure modes the intent suites
 * exercise: the three `lib/file-host-config/client.ts` normalizes, plus a
 * hang.
 *
 * Vitest against the real components, hooks and client, with only `fetch`
 * replaced, asserting on the DOM as a person reads it. A real browser and a
 * stopped `file_host` process are outside this suite's scope.
 */

// This module is test-only support code (never imported by production
// source) but doesn't itself match the repo's *.test.*/tests/** glob that
// exempts this rule; see packages/eslint/src/configs/overrides-deps.config.ts.
// eslint-disable-next-line import/no-extraneous-dependencies
import { waitFor, within } from "@testing-library/react"
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
 * Installs a `global.fetch` stub for one sabotage mode. Install it *after* the
 * component has rendered and settled its startup queries, so it fails the
 * request the user's own click makes.
 */
export function installFileHostSabotage(mode: SabotageMode): () => void {
  const impl = ((): typeof fetch => {
    switch (mode) {
      case "connection-refused": {
        // What a browser's fetch rejects with when nothing is listening;
        // createFileHostTransport wraps it as FileHostUnreachableError.
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
        // Never settles: only `requestJSON`'s own deadline ends it.
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

/** Some visible failure: a non-empty `role="alert"`/`role="status"` (what
 * `lib/intent/render` renders), or else any leaf naming a failure.
 *
 * Polls via `waitFor`: the click -> mutate -> fetch -> notify -> render
 * pipeline does not settle in a fixed number of microtask turns. */
export async function expectSomeFailureAffordance(
  container: HTMLElement
): Promise<void> {
  const failureText = /error|fail|couldn.?t|try again|retry|went wrong/i
  await waitFor(() => {
    const roleMatch = container.querySelector('[role="alert"], [role="status"]')
    if (roleMatch) {
      // An empty `[role="alert"]` (a silent `failed` arm) passes a presence
      // check; the text inside it does not.
      const accessibleText = roleMatch.textContent.trim()
      expect(
        accessibleText.length > 0,
        'found a [role="alert"]/[role="status"] failure affordance with no visible text - an empty failed arm passes a presence-only check and fails this one'
      ).toBe(true)
      return
    }
    const textMatch = Array.from(container.querySelectorAll("*")).find(
      (el) =>
        el.textContent &&
        failureText.test(el.textContent) &&
        el.children.length === 0
    )
    expect(
      textMatch,
      "expected some element naming the failure, found none"
    ).toBeTruthy()
  })
}

/**
 * The retry control's presence must track `IntentError.retryable`:
 * `unreachable` gets one, `unavailable` (not-configured) must not. Checked by
 * accessible name ("Try again"), so a restyle can't satisfy it by accident.
 */
export function expectRetryAffordanceTracksRetryable(
  container: HTMLElement,
  retryable: boolean
): void {
  const retryButtons = within(container).queryAllByRole("button", {
    name: /try again/i,
  })
  if (retryable) {
    expect(
      retryButtons.length,
      'expected a "Try again" retry control for a retryable failure, found none'
    ).toBeGreaterThan(0)
  } else {
    expect(
      retryButtons.length,
      'expected no "Try again" retry control for a non-retryable failure - a retry button wired to a request that cannot succeed is the inert-button defect in a new costume'
    ).toBe(0)
  }
}
