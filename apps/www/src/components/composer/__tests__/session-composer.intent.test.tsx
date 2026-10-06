/**
 * @vitest-environment jsdom
 *
 * Sabotage `file_host` behind the composer's "Save & Play" (create, then
 * activate, then navigate) and "Save as draft" on a new session, and check
 * what a person sees. See `test-support/file-host-sabotage.ts`.
 *
 * "hang" settles through `client.ts`'s request deadline, shortened here with
 * `VITE_FILE_HOST_TIMEOUT_MS` (read per call by `resolveTimeoutMs`).
 */

import {
  expectRetryAffordanceTracksRetryable,
  expectSomeFailureAffordance,
  installFileHostSabotage,
  SABOTAGE_MODES,
} from "@/test-support/file-host-sabotage"
import { signInForTests } from "@/test-support/sign-in"
import { resetViewport, setViewport } from "@/test-support/viewport"
import type * as ReactRouterModule from "@tanstack/react-router"
import { cleanup, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { click, renderAtReviewStep } from "./helpers"

const navigateSpy = vi.fn()

vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const actual = await importOriginal<typeof ReactRouterModule>()
    return { ...actual, useNavigate: () => navigateSpy }
  }
)

const { SessionComposer } = await import(
  "@/components/composer/session-composer"
)

const SAVE_AND_PLAY = /save.*play/i
const SAVE_AS_DRAFT = /save as draft/i

/** No jest-dom here: a plain attribute check. */
const isDisabled = (name: RegExp): boolean =>
  screen.getByRole("button", { name }).hasAttribute("disabled")

const REJECTING_MODES = SABOTAGE_MODES.filter((mode) => mode !== "hang")

/** `not-configured` is the one rejecting mode that is not retryable
 * (`unavailable`, `lib/intent/errors.ts`). None of these modes blocks
 * resubmission: only a `POST` timeout ("hang") does. */
function isRetryableMode(mode: (typeof REJECTING_MODES)[number]): boolean {
  return mode !== "not-configured"
}

/** Walks to review, sabotages `fetch`, presses `button`; returns restore. */
async function pressSabotaged(
  mode: (typeof SABOTAGE_MODES)[number],
  button: RegExp
): Promise<() => void> {
  if (mode === "hang") vi.stubEnv("VITE_FILE_HOST_TIMEOUT_MS", "50")
  await renderAtReviewStep(SessionComposer)
  const restore = installFileHostSabotage(mode)
  await click(screen.getByRole("button", { name: button }))
  return restore
}

// These suites are about the account's store failing: start from an account.
beforeEach(() => {
  signInForTests()
  navigateSpy.mockClear()
  // The wizard: these flows walk it with Continue, which is the wide layout.
  setViewport(false)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  resetViewport()
})

describe("composer Save & Play, new session", () => {
  describe.each(REJECTING_MODES)("file_host sabotaged: %s", (mode) => {
    it("re-enables the button once the request settles, whether or not the failure was retryable (sanity)", async () => {
      const restore = await pressSabotaged(mode, SAVE_AND_PLAY)

      // Every mode here settles definitely, so the button comes back: "Try
      // again" if retryable, else the original action.
      await waitFor(() => {
        expect(isDisabled(/save.*play|try.*again/i)).toBe(false)
      })
      restore()
    })

    it("never navigates to a session that was never marked active (sanity)", async () => {
      const restore = await pressSabotaged(mode, SAVE_AND_PLAY)

      expect(navigateSpy).not.toHaveBeenCalled()
      restore()
    })

    it("tells the person the save failed, with a retry control tracking retryability", async () => {
      const restore = await pressSabotaged(mode, SAVE_AND_PLAY)

      await expectSomeFailureAffordance(document.body)
      expectRetryAffordanceTracksRetryable(document.body, isRetryableMode(mode))
      restore()
    })
  })

  describe("file_host sabotaged: hang", () => {
    it("eventually tells the person something is wrong, with the original action disabled rather than resubmittable, since createSession is a POST unsafe to retry blind", async () => {
      const restore = await pressSabotaged("hang", SAVE_AND_PLAY)

      await expectSomeFailureAffordance(document.body)
      // A timed-out POST may already have created the session, so neither
      // "Try again" nor the original action is offered (client.ts's
      // isNonIdempotent, IntentButton's header).
      expectRetryAffordanceTracksRetryable(document.body, false)
      expect(isDisabled(SAVE_AND_PLAY)).toBe(true)
      restore()
    })

    it("also disables the sibling 'Save as draft' button - it shares the same createSession POST and would otherwise still resubmit it", async () => {
      const restore = await pressSabotaged("hang", SAVE_AND_PLAY)

      await expectSomeFailureAffordance(document.body)
      // It looks idle, but would fire the same shared `createIntent` POST.
      expect(isDisabled(SAVE_AS_DRAFT)).toBe(true)
      restore()
    })
  })
})

describe("composer Save as draft, new session", () => {
  describe.each(REJECTING_MODES)("file_host sabotaged: %s", (mode) => {
    it("tells the person saving as a draft failed, with a retry control tracking retryability", async () => {
      const restore = await pressSabotaged(mode, SAVE_AS_DRAFT)

      await expectSomeFailureAffordance(document.body)
      expectRetryAffordanceTracksRetryable(document.body, isRetryableMode(mode))
      expect(navigateSpy).not.toHaveBeenCalled()
      restore()
    })
  })

  describe("file_host sabotaged: hang", () => {
    it("disables both create buttons when 'Save as draft' is the one that times out - the mirror direction of the 'Save & Play' case", async () => {
      const restore = await pressSabotaged("hang", SAVE_AS_DRAFT)

      await expectSomeFailureAffordance(document.body)
      expect(isDisabled(SAVE_AS_DRAFT)).toBe(true)
      expect(isDisabled(SAVE_AND_PLAY)).toBe(true)
      restore()
    })
  })
})
