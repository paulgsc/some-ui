/**
 * @vitest-environment jsdom
 *
 * #939, S2 of #934: sabotage `file_host` behind the #933 flow — the
 * composer's "Save & Play" on a new session, which chains
 * `createSession.mutate` into `updateSession.mutate` into `navigate` inside
 * each other's `onSuccess` — and record what a person actually sees.
 *
 * See `test-support/file-host-sabotage.ts` for why this is Vitest against
 * the real `SessionComposer`, not a Playwright suite booting the real app.
 *
 * Every `test.fails` below encodes the *desired* outcome (#936's job), not
 * today's. It exists to go green when #936 lands, and to fail loudly if it
 * ever silently starts passing beforehand (which would mean the assertion
 * itself stopped being meaningful).
 */

import type { JSX, ReactNode } from "react"
import {
  expectSomeFailureAffordance,
  installFileHostSabotage,
  SABOTAGE_MODES,
} from "@/test-support/file-host-sabotage"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type * as ReactRouterModule from "@tanstack/react-router"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
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

const REJECTING_MODES = SABOTAGE_MODES.filter((mode) => mode !== "hang")

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

      expect(
        isDisabled(screen.getByRole("button", { name: /save.*play/i }))
      ).toBe(false)
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

    it.fails(
      "tells the person the save failed (#936 — today renders nothing)",
      async () => {
        await renderAtReviewStep()
        const restore = installFileHostSabotage(mode)

        // eslint-disable-next-line @typescript-eslint/require-await -- see renderAtReviewStep
        await act(async () => {
          clickSaveAndPlay()
        })

        await expectSomeFailureAffordance(document.body)
        restore()
      }
    )
  })

  describe("file_host sabotaged: hang (no timeout exists to hit)", () => {
    it.fails(
      "eventually tells the person something is wrong, or offers a way out (#936 — today waits forever, silently)",
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
