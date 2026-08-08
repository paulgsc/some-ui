/**
 * @vitest-environment jsdom
 *
 * The #933 flow itself: create a session, then activate it. Proves #943's
 * acceptance criterion directly - a failure in the second step never
 * reverts or re-triggers the first, and retrying only re-runs the step that
 * actually failed.
 */

import type { JSX, ReactNode } from "react"
import { matchIntent } from "@some-ui/intent-kit"
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { composeSequentialIntents } from "./compose"
import { useIntent } from "./use-intent"
import { useIntentEffect } from "./use-intent-effect"

function withQueryClient(): {
  wrapper: (props: { children: ReactNode }) => JSX.Element
} {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  }
}

function summarize(state: ReturnType<typeof composeSequentialIntents>): string {
  return matchIntent(state, {
    idle: () => "idle",
    working: (step) => `working:${step ?? "?"}`,
    succeeded: (value) => `succeeded:${JSON.stringify(value)}`,
    failed: (error) => `failed:${error.kind}`,
  })
}

function useSaveAndPlayChain(
  createFn: (name: string) => Promise<string>,
  activateFn: (sessionId: string) => Promise<string>
): {
  start: (name: string) => void
  retryComposite: () => void
  composite: ReturnType<typeof composeSequentialIntents>
} {
  const create = useIntent(useMutation({ mutationFn: createFn }), {
    presentation: "interactive",
  })
  const activate = useIntent(useMutation({ mutationFn: activateFn }), {
    presentation: "interactive",
  })
  // The chain: activate starts automatically once create succeeds - the
  // shape session-composer.tsx's onSuccess-nested-in-onSuccess produces
  // today, expressed through useIntentEffect instead of a render-phase
  // side effect (see that module's header for why the difference matters).
  useIntentEffect(create.state, (createdSessionId) => {
    activate.start(createdSessionId)
  })

  const composite = composeSequentialIntents(create.state, activate.state, {
    first: "create",
    second: "activate",
  })

  const retryComposite = (): void => {
    matchIntent(composite, {
      idle: () => undefined,
      working: () => undefined,
      succeeded: () => undefined,
      failed: (_error, retry) => retry(),
    })
  }

  return { start: create.start, retryComposite, composite }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("composeSequentialIntents (the Save & Play chain)", () => {
  it("create-succeeded-then-activate-failed does not revert or re-run create, and retry only re-runs activate", async () => {
    const { wrapper } = withQueryClient()
    // eslint-disable-next-line @typescript-eslint/require-await -- mutationFn's contract is Promise<T>; async is the plainest way to satisfy it for a stub with nothing to actually await.
    const createFn = vi.fn(async (name: string) => `session:${name}`)
    let rejectActivate = true
    // eslint-disable-next-line @typescript-eslint/require-await -- see createFn above
    const activateFn = vi.fn(async (sessionId: string) => {
      if (rejectActivate) throw new Error("activate failed")
      return `active:${sessionId}`
    })

    const { result } = renderHook(
      () => useSaveAndPlayChain(createFn, activateFn),
      { wrapper }
    )

    expect(summarize(result.current.composite)).toBe("idle")

    act(() => {
      result.current.start("my-session")
    })

    // Working, through both steps, then failed - on activate's error, not
    // create's, because create genuinely succeeded.
    await waitFor(() => {
      expect(summarize(result.current.composite)).toBe("failed:unknown")
    })

    expect(createFn.mock.calls).toHaveLength(1)
    expect(createFn.mock.calls[0]?.[0]).toBe("my-session")
    expect(activateFn.mock.calls).toHaveLength(1)
    expect(activateFn.mock.calls[0]?.[0]).toBe("session:my-session")

    // Retry: activate is allowed to succeed this time.
    rejectActivate = false
    act(() => {
      result.current.retryComposite()
    })

    await waitFor(() => {
      expect(summarize(result.current.composite)).toBe(
        'succeeded:"active:session:my-session"'
      )
    })

    // The whole point: create was never called again (no duplicate
    // session), and activate was called exactly twice - the original
    // failure and the retry, both for the same session id create already
    // produced.
    expect(createFn.mock.calls).toHaveLength(1)
    expect(activateFn.mock.calls).toHaveLength(2)
    expect(activateFn.mock.calls[1]?.[0]).toBe("session:my-session")
  })
})
