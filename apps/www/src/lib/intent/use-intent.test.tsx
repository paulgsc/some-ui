/**
 * @vitest-environment jsdom
 */

import type { JSX, ReactNode } from "react"
import type { Intent } from "@some-ui/intent-kit"
import { matchIntent } from "@some-ui/intent-kit"
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useIntent } from "./use-intent"

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

/** Reads the current state through the sealed accessor, the same way a
 * real consumer would - never `.state.status` directly. */
function summarize<T>(state: Intent<T>): string {
  return matchIntent(state, {
    idle: () => "idle",
    working: () => "working",
    succeeded: (value) => `succeeded:${JSON.stringify(value)}`,
    failed: (error) => `failed:${error.kind}`,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("useIntent", () => {
  it("starts idle, and the sequence idle -> working -> succeeded matches the real mutation", async () => {
    const { wrapper } = withQueryClient()
    // Held open under the test's own control rather than a fixed delay: a
    // timer-based delay races against however TanStack's mutation observer
    // happens to schedule its own notifications, which is exactly what made
    // this assertion flaky before. A promise that only resolves when the
    // test says so makes "working" a stable state to observe, not a window
    // to get lucky catching.
    let resolveMutation: ((value: string) => void) | undefined
    const mutationFn = vi.fn(
      (input: string) =>
        new Promise<string>((resolve) => {
          resolveMutation = (): void => {
            resolve(`created:${input}`)
          }
        })
    )

    const { result } = renderHook(
      () =>
        useIntent(useMutation({ mutationFn }), { presentation: "interactive" }),
      { wrapper }
    )

    expect(summarize(result.current.state)).toBe("idle")

    act(() => {
      result.current.start("session-a")
    })

    await waitFor(() => {
      expect(summarize(result.current.state)).toBe("working")
    })

    act(() => {
      resolveMutation?.("session-a")
    })

    await waitFor(() => {
      expect(summarize(result.current.state)).toBe(
        'succeeded:"created:session-a"'
      )
    })

    expect(mutationFn.mock.calls).toHaveLength(1)
    expect(mutationFn.mock.calls[0]?.[0]).toBe("session-a")
  })

  it("maps a rejected mutation to a failed intent carrying a working retry", async () => {
    const { wrapper } = withQueryClient()
    const mutationFn = vi
      .fn<(input: string) => Promise<string>>()
      .mockRejectedValue(new Error("boom"))

    const { result } = renderHook(
      () =>
        useIntent(useMutation({ mutationFn }), { presentation: "interactive" }),
      { wrapper }
    )

    act(() => {
      result.current.start("session-a")
    })

    await waitFor(() => {
      expect(summarize(result.current.state)).toBe("failed:unknown")
    })

    mutationFn.mockClear()
    mutationFn.mockResolvedValueOnce("recovered")

    matchIntent(result.current.state, {
      idle: () => undefined,
      working: () => undefined,
      succeeded: () => undefined,
      failed: (_error, retry) => {
        act(() => {
          retry()
        })
      },
    })

    // retry() re-ran with the original variables ("session-a"), not
    // something re-derived or lost - #943's own named regression risk.
    // (TanStack's mutationFn also receives an internal context object as a
    // second argument; only the caller-supplied variable is asserted here.)
    await waitFor(() => {
      expect(mutationFn.mock.calls).toHaveLength(1)
    })
    expect(mutationFn.mock.calls[0]?.[0]).toBe("session-a")
    await waitFor(() => {
      expect(summarize(result.current.state)).toBe('succeeded:"recovered"')
    })
  })

  it("uses a custom mapError when supplied, instead of the file_host default", async () => {
    const { wrapper } = withQueryClient()
    const mutationFn = vi
      .fn<(input: string) => Promise<string>>()
      .mockRejectedValue(new Error("domain-specific failure"))

    const { result } = renderHook(
      () =>
        useIntent(useMutation({ mutationFn }), {
          presentation: "interactive",
          mapError: () => ({
            kind: "rejected",
            retryable: false,
            summary: "custom summary",
            cause: "custom cause",
          }),
        }),
      { wrapper }
    )

    act(() => {
      result.current.start("x")
    })

    await waitFor(() => {
      expect(summarize(result.current.state)).toBe("failed:rejected")
    })
  })

  it("reset() returns a succeeded intent to idle", async () => {
    const { wrapper } = withQueryClient()
    // eslint-disable-next-line @typescript-eslint/require-await -- mutationFn's contract is Promise<T>; async is the plainest way to satisfy it for a stub with nothing to actually await.
    const mutationFn = vi.fn(async (_input: string) => "done")

    const { result } = renderHook(
      () =>
        useIntent(useMutation({ mutationFn }), { presentation: "interactive" }),
      { wrapper }
    )

    act(() => {
      result.current.start("x")
    })
    await waitFor(() => {
      expect(summarize(result.current.state)).toBe('succeeded:"done"')
    })

    act(() => {
      result.current.reset()
    })
    await waitFor(() => {
      expect(summarize(result.current.state)).toBe("idle")
    })
  })

  it("exposes the presentation option unchanged, for the renderer to read", () => {
    const { wrapper } = withQueryClient()
    // eslint-disable-next-line @typescript-eslint/require-await -- mutationFn's contract is Promise<T>; async is the plainest way to satisfy it for a stub with nothing to actually await.
    const mutationFn = vi.fn(async () => "done")

    const { result } = renderHook(
      () => useIntent(useMutation({ mutationFn }), { presentation: "ambient" }),
      { wrapper }
    )

    expect(result.current.presentation).toBe("ambient")
  })

  it("does not expose a raw status or isPending - only `state` and `presentation` are on the result", () => {
    const { wrapper } = withQueryClient()
    // eslint-disable-next-line @typescript-eslint/require-await -- mutationFn's contract is Promise<T>; async is the plainest way to satisfy it for a stub with nothing to actually await.
    const mutationFn = vi.fn(async () => "done")

    const { result } = renderHook(
      () =>
        useIntent(useMutation({ mutationFn }), { presentation: "interactive" }),
      { wrapper }
    )

    expect(Object.keys(result.current).sort()).toEqual([
      "presentation",
      "reset",
      "start",
      "state",
    ])
  })

  it("leaves the underlying mutation's own onMutate/onSuccess/onSettled behaviour untouched", async () => {
    const { wrapper } = withQueryClient()
    const calls: Array<string> = []
    // eslint-disable-next-line @typescript-eslint/require-await -- mutationFn's contract is Promise<T>; async is the plainest way to satisfy it for a stub with nothing to actually await.
    const mutationFn = vi.fn(async (input: string) => `created:${input}`)

    const { result } = renderHook(
      () =>
        useIntent(
          useMutation({
            mutationFn,
            onMutate: (variables) => {
              calls.push(`onMutate:${variables}`)
            },
            onSuccess: (data) => {
              calls.push(`onSuccess:${data}`)
            },
            onSettled: () => {
              calls.push("onSettled")
            },
          }),
          { presentation: "interactive" }
        ),
      { wrapper }
    )

    act(() => {
      result.current.start("session-a")
    })

    await waitFor(() => {
      expect(summarize(result.current.state)).toBe(
        'succeeded:"created:session-a"'
      )
    })

    expect(calls).toEqual([
      "onMutate:session-a",
      "onSuccess:created:session-a",
      "onSettled",
    ])
  })

  it("thundering-herd guard: two start() calls in the same burst dispatch only once", async () => {
    const { wrapper } = withQueryClient()
    // eslint-disable-next-line @typescript-eslint/require-await -- mutationFn's contract is Promise<T>; async is the plainest way to satisfy it for a stub with nothing to actually await.
    const mutationFn = vi.fn(async (input: string) => `created:${input}`)

    const { result } = renderHook(
      () =>
        useIntent(useMutation({ mutationFn }), { presentation: "interactive" }),
      { wrapper }
    )

    // Two calls with no `act`/`await` between them, mimicking a fast
    // double-click or two synchronous `fireEvent.click()`s landing before
    // React has re-rendered with the "pending" status - the exact race
    // #936 calls out for "Save and play".
    act(() => {
      result.current.start("session-a")
      result.current.start("session-a")
    })

    await waitFor(() => {
      expect(summarize(result.current.state)).toBe(
        'succeeded:"created:session-a"'
      )
    })

    expect(mutationFn.mock.calls).toHaveLength(1)
  })

  it("thundering-herd guard: retry() during an in-flight retry does not double-dispatch", async () => {
    const { wrapper } = withQueryClient()
    let resolveMutation: ((value: string) => void) | undefined
    const mutationFn = vi
      .fn<(input: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockImplementation(
        (input: string) =>
          new Promise<string>((resolve) => {
            resolveMutation = (): void => {
              resolve(`created:${input}`)
            }
          })
      )

    const { result } = renderHook(
      () =>
        useIntent(useMutation({ mutationFn }), { presentation: "interactive" }),
      { wrapper }
    )

    act(() => {
      result.current.start("session-a")
    })
    await waitFor(() => {
      expect(summarize(result.current.state)).toBe("failed:unknown")
    })

    matchIntent(result.current.state, {
      idle: () => undefined,
      working: () => undefined,
      succeeded: () => undefined,
      failed: (_error, retry) => {
        act(() => {
          // Two retries in the same burst - only the first should dispatch.
          retry()
          retry()
        })
      },
    })

    await waitFor(() => {
      expect(summarize(result.current.state)).toBe("working")
    })

    act(() => {
      resolveMutation?.("session-a")
    })
    await waitFor(() => {
      expect(summarize(result.current.state)).toBe(
        'succeeded:"created:session-a"'
      )
    })

    // One dispatch from start(), exactly one from the retry burst.
    expect(mutationFn.mock.calls).toHaveLength(2)
  })
})
