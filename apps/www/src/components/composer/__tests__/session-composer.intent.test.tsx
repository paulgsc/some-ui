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
 * #937 S3 promoted this suite from characterization to enforcement: every
 * `it.fails` this suite originally wrote to encode the *desired*,
 * not-yet-true outcome flipped to a plain `it` - except "hang" mode, which
 * had no timeout anywhere in `client.ts`'s chain to hit, so a stuck request
 * waited forever with nothing telling the person why. The route-arrival
 * handoff (r1) is what finally shipped that timeout - #911's own census of
 * raw `fetch` call sites had missed `client.ts` itself - so "hang" now
 * flips to a plain `it` too, the same way its siblings already had.
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

const { SessionComposer } = await import(
  "@/components/composer/session-composer"
)

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

/** None of `REJECTING_MODES` produces the one `IntentError` shape that
 * blocks resubmission (`blocksResubmission: true`) - that's exclusive to a
 * `POST` timeout (see the "hang" describe block below and
 * `lib/intent/errors.ts`'s `fromUnreachable`), which these fast-rejecting
 * modes never hit. `not-configured` is a definite, if permanent, "no" -
 * unlike an ambiguous timeout, resubmitting it is harmless, just futile. */

beforeEach(() => {
  navigateSpy.mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("composer Save & Play, new session (#933's flow)", () => {
  describe.each(REJECTING_MODES)("file_host sabotaged: %s", (mode) => {
    it("re-enables the button once the request settles, whether or not the failure was retryable (sanity)", async () => {
      await renderAtReviewStep()
      const restore = installFileHostSabotage(mode)

      // eslint-disable-next-line @typescript-eslint/require-await -- see renderAtReviewStep
      await act(async () => {
        clickSaveAndPlay()
      })

      // Every mode here settles to a definite outcome (a real answer, or a
      // known-unconfigured feature) - never the ambiguous POST-timeout case
      // that's unsafe to resubmit - so the button always comes back
      // enabled: "Try again" for a retryable failure, the original action
      // for a non-retryable-but-definite one. See IntentButton's own header.
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

  describe("file_host sabotaged: hang", () => {
    // No longer `it.fails`: the route-arrival work (r1) gave `client.ts` a
    // request deadline (#911's missed 14th raw-`fetch` site), so a stuck
    // request now settles instead of waiting forever - the gap this suite
    // used to record as deferred. `VITE_FILE_HOST_TIMEOUT_MS` shortens that
    // deadline so this test doesn't itself wait out the real ~10s default;
    // see `client.ts`'s `resolveTimeoutMs` for why a stub set here, after
    // the module has already loaded, still takes effect.
    it("eventually tells the person something is wrong, with the original action disabled rather than resubmittable, since createSession is a POST a bot review caught as unsafe to retry blind", async () => {
      vi.stubEnv("VITE_FILE_HOST_TIMEOUT_MS", "50")
      await renderAtReviewStep()
      const restore = installFileHostSabotage("hang")

      // eslint-disable-next-line @typescript-eslint/require-await -- see renderAtReviewStep
      await act(async () => {
        clickSaveAndPlay()
      })

      await expectSomeFailureAffordance(document.body)
      // A timeout on createSession's own POST /sessions cannot tell "never
      // reached file_host" from "file_host already created it and the
      // response was slow" - neither a "Try again" button nor a clickable
      // original action is safe here, since either would resubmit the same
      // POST and risk a duplicate session. See client.ts's isNonIdempotent,
      // FileHostUnreachableError's retryable doc, and IntentButton's own
      // header on why a non-retryable failure disables outright rather than
      // falling back to onPress.
      expectRetryAffordanceTracksRetryable(document.body, false)
      expect(
        isDisabled(screen.getByRole("button", { name: /save.*play/i }))
      ).toBe(true)
      restore()
    })

    it("also disables the sibling 'Save as draft' button - it shares the same createSession POST and would otherwise still resubmit it", async () => {
      vi.stubEnv("VITE_FILE_HOST_TIMEOUT_MS", "50")
      await renderAtReviewStep()
      const restore = installFileHostSabotage("hang")

      // eslint-disable-next-line @typescript-eslint/require-await -- see renderAtReviewStep
      await act(async () => {
        clickSaveAndPlay()
      })

      await expectSomeFailureAffordance(document.body)
      // "Save as draft" never itself failed - it projects to `idle()` while
      // `activeAction` is "play" (see session-composer.tsx's own comment on
      // that projection) - but it calls the same shared `createIntent`, so
      // an idle-looking, enabled button here would still fire a second
      // `POST /sessions` on click and risk a duplicate session. A bot review
      // caught this exact sibling-button bypass one round after the
      // original-action bypass (this same button, before this fix) was
      // fixed.
      expect(
        isDisabled(screen.getByRole("button", { name: /save as draft/i }))
      ).toBe(true)
      restore()
    })
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

  describe("file_host sabotaged: hang", () => {
    it("disables both create buttons when 'Save as draft' is the one that times out - the mirror direction of the 'Save & Play' case", async () => {
      vi.stubEnv("VITE_FILE_HOST_TIMEOUT_MS", "50")
      await renderAtReviewStep()
      const restore = installFileHostSabotage("hang")

      // eslint-disable-next-line @typescript-eslint/require-await -- see renderAtReviewStep
      await act(async () => {
        clickSaveAsDraft()
      })

      await expectSomeFailureAffordance(document.body)
      expect(
        isDisabled(screen.getByRole("button", { name: /save as draft/i }))
      ).toBe(true)
      expect(
        isDisabled(screen.getByRole("button", { name: /save.*play/i }))
      ).toBe(true)
      restore()
    })
  })
})
