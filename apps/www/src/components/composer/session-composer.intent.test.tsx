/**
 * @vitest-environment jsdom
 *
 * #939/#950: sabotage `file_host` behind the #933 flow — the composer's
 * "Save & Play" and "Save as draft" on a new session — and record what a
 * person actually sees. "Save & Play" chains `createSession.mutate` into
 * `updateSession.mutate` into `navigate` inside each other's `onSuccess`.
 *
 * See `test-support/file-host-sabotage.ts` for why this is Vitest against
 * the real `SessionComposer`, not a Playwright suite booting the real app.
 *
 * #937 S3 promotes this suite from characterization to enforcement: every
 * `it.fails` this suite originally wrote to encode the *desired*,
 * not-yet-true outcome has flipped to a plain `it` - except one. "hang" mode
 * has no timeout anywhere in `client.ts`'s chain to hit, so a stuck request
 * still waits forever with nothing telling the person why. Flipping that one
 * to a plain `it` would require shipping a request-timeout feature, which is
 * a product decision outside this epic's charter (type/lint/CI enforcement
 * of the boundary that already exists) - so it stays `it.fails`, a searchable
 * record of a real, separately-scoped gap rather than a silently dropped or
 * dishonestly "passing" one.
 */

import type { JSX, ReactNode } from "react"
import {
  expectRetryAffordanceTracksRetryable,
  expectSomeFailureAffordance,
  installFileHostSabotage,
  SABOTAGE_MODES,
} from "@/test-support/file-host-sabotage"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type * as ReactRouterModule from "@tanstack/react-router"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const navigateSpy = vi.fn()

vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const actual = await importOriginal<typeof ReactRouterModule>()
    return { ...actual, useNavigate: () => navigateSpy }
  }
)

const { SessionComposer } = await import("./session-composer")

/** No jest-dom in this app's vitest setup (see other component tests in
 * this app) - a plain attribute check avoids needing an HTMLButtonElement
 * type assertion just to read `.disabled`. */
function isDisabled(element: HTMLElement): boolean {
  return element.hasAttribute("disabled")
}

/** Matches production's own mutation defaults (providers/tanstack-query.tsx):
 * `retry: false` is why a failure surfaces on the first attempt rather than
 * after TanStack Query's default three retries. */
function withQueryClient(children: ReactNode): JSX.Element {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

async function renderAtReviewStep(): Promise<void> {
  render(withQueryClient(<SessionComposer initialActivity="honeycomb" />))
  for (let i = 0; i < 3; i += 1) {
    const continueButton = screen.getByRole("button", { name: /continue/i })
    // act's async form is what flushes the microtask-queued mutation state
    // update (see file-host-sabotage.ts's own header); there is nothing
    // local to await inside the callback itself.
    // eslint-disable-next-line @typescript-eslint/require-await
    await act(async () => {
      fireEvent.click(continueButton)
    })
  }
}

function clickSaveAndPlay(): void {
  fireEvent.click(screen.getByRole("button", { name: /save.*play/i }))
}

function clickSaveAsDraft(): void {
  fireEvent.click(screen.getByRole("button", { name: /save as draft/i }))
}

const REJECTING_MODES = SABOTAGE_MODES.filter((mode) => mode !== "hang")

/** `not-configured` -> `FileHostNotConfiguredError` -> `IntentError.kind
 * "unavailable"`, the one rejecting mode that is not retryable - see
 * `lib/intent/errors.ts`'s `mapFileHostError`. */
function isRetryableMode(mode: (typeof REJECTING_MODES)[number]): boolean {
  return mode !== "not-configured"
}

beforeEach(() => {
  navigateSpy.mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("composer Save & Play, new session (#933's flow)", () => {
  describe.each(REJECTING_MODES)("file_host sabotaged: %s", (mode) => {
    it("re-enables the button once the request settles (sanity)", async () => {
      await renderAtReviewStep()
      const restore = installFileHostSabotage(mode)

      // eslint-disable-next-line @typescript-eslint/require-await -- see renderAtReviewStep
      await act(async () => {
        clickSaveAndPlay()
      })

      await waitFor(() => {
        expect(
          isDisabled(
            screen.getByRole("button", { name: /save.*play|try.*again/i })
          )
        ).toBe(false)
      })
      restore()
    })

    it("never navigates to a session that was never marked active (sanity)", async () => {
      await renderAtReviewStep()
      const restore = installFileHostSabotage(mode)

      // eslint-disable-next-line @typescript-eslint/require-await -- see renderAtReviewStep
      await act(async () => {
        clickSaveAndPlay()
      })

      // The chain correctly halts rather than doing something worse (like
      // opening a player for a session that was never actually created or
      // started) - this much of the failure handling is already right.
      expect(navigateSpy).not.toHaveBeenCalled()
      restore()
    })

    it("tells the person the save failed, with a retry control tracking retryability", async () => {
      await renderAtReviewStep()
      const restore = installFileHostSabotage(mode)

      // eslint-disable-next-line @typescript-eslint/require-await -- see renderAtReviewStep
      await act(async () => {
        clickSaveAndPlay()
      })

      await expectSomeFailureAffordance(document.body)
      expectRetryAffordanceTracksRetryable(document.body, isRetryableMode(mode))
      restore()
    })
  })

  describe("file_host sabotaged: hang (no timeout exists to hit)", () => {
    it.fails(
      "eventually tells the person something is wrong, or offers a way out (deferred - no request-timeout mechanism exists anywhere in the chain today; tracked separately from #937)",
      async () => {
        await renderAtReviewStep()
        const restore = installFileHostSabotage("hang")

        fireEvent.click(screen.getByRole("button", { name: /save.*play/i }))

        // Long enough that any reasonable "this is taking a while" affordance
        // would have appeared; short enough the suite doesn't itself hang.
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 500))
        })

        // The only thing true today: the button is still disabled, forever,
        // with nothing telling the person why or offering to cancel.
        expect(
          isDisabled(screen.getByRole("button", { name: /save.*play/i }))
        ).toBe(true)
        await expectSomeFailureAffordance(document.body)
        restore()
      }
    )
  })
})

describe("composer Save as draft, new session (#950 coverage extension)", () => {
  describe.each(REJECTING_MODES)("file_host sabotaged: %s", (mode) => {
    it("tells the person saving as a draft failed, with a retry control tracking retryability", async () => {
      await renderAtReviewStep()
      const restore = installFileHostSabotage(mode)

      // eslint-disable-next-line @typescript-eslint/require-await -- see renderAtReviewStep
      await act(async () => {
        clickSaveAsDraft()
      })

      await expectSomeFailureAffordance(document.body)
      expectRetryAffordanceTracksRetryable(document.body, isRetryableMode(mode))
      expect(navigateSpy).not.toHaveBeenCalled()
      restore()
    })
  })
})
