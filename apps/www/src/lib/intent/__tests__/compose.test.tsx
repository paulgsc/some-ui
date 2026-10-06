/**
 * @vitest-environment jsdom
 *
 * Create a session, then activate it: a failure in the second step never
 * reverts or re-triggers the first, and retrying re-runs only the failed
 * step.
 */

import { queryClientWrapper } from "@/test-support/query-client"
import { matchIntent } from "@some-ui/intent-kit"
import { useMutation } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { composeSequentialIntents } from "@/lib/intent/compose"
import { useIntent } from "@/lib/intent/use-intent"
import { useIntentEffect } from "@/lib/intent/use-intent-effect"

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
  // Activate starts once create succeeds, via useIntentEffect rather than a
  // render-phase side effect.
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
    const wrapper = queryClientWrapper()
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

    // Create was never called again; activate twice (failure and retry),
    // both for the session create produced.
    expect(createFn.mock.calls).toHaveLength(1)
    expect(activateFn.mock.calls).toHaveLength(2)
    expect(activateFn.mock.calls[1]?.[0]).toBe("session:my-session")
  })
})
