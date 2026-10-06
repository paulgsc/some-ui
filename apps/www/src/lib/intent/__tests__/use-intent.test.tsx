/**
 * @vitest-environment jsdom
 */

import { queryClientWrapper } from "@/test-support/query-client"
import type { Intent } from "@some-ui/intent-kit"
import { matchIntent } from "@some-ui/intent-kit"
import { useMutation } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useIntent } from "@/lib/intent/use-intent"

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
    const wrapper = queryClientWrapper()
    // Held open under the test's control: a timer races TanStack's
    // notification scheduling, which made this flaky.
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
    const wrapper = queryClientWrapper()
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

    // retry() re-ran with the original variables. (mutationFn also gets
    // TanStack's context as a second argument; only the variable is checked.)
    await waitFor(() => {
      expect(mutationFn.mock.calls).toHaveLength(1)
    })
    expect(mutationFn.mock.calls[0]?.[0]).toBe("session-a")
    await waitFor(() => {
      expect(summarize(result.current.state)).toBe('succeeded:"recovered"')
    })
  })

  it("uses a custom mapError when supplied, instead of the file_host default", async () => {
    const wrapper = queryClientWrapper()
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
    const wrapper = queryClientWrapper()
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
    const wrapper = queryClientWrapper()
    // eslint-disable-next-line @typescript-eslint/require-await -- mutationFn's contract is Promise<T>; async is the plainest way to satisfy it for a stub with nothing to actually await.
    const mutationFn = vi.fn(async () => "done")

    const { result } = renderHook(
      () => useIntent(useMutation({ mutationFn }), { presentation: "ambient" }),
      { wrapper }
    )

    expect(result.current.presentation).toBe("ambient")
  })

  it("does not expose a raw status or isPending - only `state` and `presentation` are on the result", () => {
    const wrapper = queryClientWrapper()
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
    const wrapper = queryClientWrapper()
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
    const wrapper = queryClientWrapper()
    // eslint-disable-next-line @typescript-eslint/require-await -- mutationFn's contract is Promise<T>; async is the plainest way to satisfy it for a stub with nothing to actually await.
    const mutationFn = vi.fn(async (input: string) => `created:${input}`)

    const { result } = renderHook(
      () =>
        useIntent(useMutation({ mutationFn }), { presentation: "interactive" }),
      { wrapper }
    )

    // Two calls with no `act`/`await` between them: a fast double-click
    // landing before React re-renders with "pending".
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
    const wrapper = queryClientWrapper()
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
