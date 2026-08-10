/**
 * @vitest-environment jsdom
 */

import type { Intent } from "@some-ui/intent-kit"
import { matchIntent } from "@some-ui/intent-kit"
import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useAsyncIntent } from "./use-async-intent"

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

describe("useAsyncIntent", () => {
  it("starts idle, and the sequence idle -> working -> succeeded matches the wrapped promise", async () => {
    let resolveFn: ((value: string) => void) | undefined
    const fn = vi.fn(
      (input: string) =>
        new Promise<string>((resolve) => {
          resolveFn = (): void => {
            resolve(`done:${input}`)
          }
        })
    )

    const { result } = renderHook(() =>
      useAsyncIntent(fn, { presentation: "interactive" })
    )

    expect(summarize(result.current.state)).toBe("idle")

    act(() => {
      result.current.start("a")
    })

    await waitFor(() => {
      expect(summarize(result.current.state)).toBe("working")
    })

    act(() => {
      resolveFn?.("a")
    })

    await waitFor(() => {
      expect(summarize(result.current.state)).toBe('succeeded:"done:a"')
    })

    expect(fn.mock.calls).toHaveLength(1)
    expect(fn.mock.calls[0]?.[0]).toBe("a")
  })

  it("maps a rejected promise to a failed intent carrying a working retry", async () => {
    const fn = vi
      .fn<(input: string) => Promise<string>>()
      .mockRejectedValue(new Error("boom"))

    const { result } = renderHook(() =>
      useAsyncIntent(fn, { presentation: "interactive" })
    )

    act(() => {
      result.current.start("a")
    })

    await waitFor(() => {
      expect(summarize(result.current.state)).toBe("failed:unknown")
    })

    fn.mockClear()
    fn.mockResolvedValueOnce("recovered")

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

    // retry() re-ran with the original variables ("a"), not something
    // re-derived or lost.
    await waitFor(() => {
      expect(fn.mock.calls).toHaveLength(1)
    })
    expect(fn.mock.calls[0]?.[0]).toBe("a")
    await waitFor(() => {
      expect(summarize(result.current.state)).toBe('succeeded:"recovered"')
    })
  })

  it("never rejects even when fn never throws - a resolving fn that returns void still reaches succeeded", async () => {
    // The shape study-nudge-section.tsx's own handlers actually have: every
    // branch already resolves (see service-worker.ts's own "no-op that
    // resolves falsy... rather than throwing"), so `failed` here is a
    // backstop, not the common case.
    // eslint-disable-next-line @typescript-eslint/require-await -- fn's contract is Promise<void>; async is the plainest way to satisfy it for a stub with nothing to actually await.
    const fn = vi.fn(async (_enabled: boolean) => undefined)

    const { result } = renderHook(() =>
      useAsyncIntent(fn, { presentation: "interactive" })
    )

    act(() => {
      result.current.start(true)
    })

    await waitFor(() => {
      expect(summarize(result.current.state)).toBe("succeeded:undefined")
    })
  })

  it("thundering-herd guard: two start() calls in the same burst dispatch only once", async () => {
    // eslint-disable-next-line @typescript-eslint/require-await -- fn's contract is Promise<string>; async is the plainest way to satisfy it for a stub with nothing to actually await.
    const fn = vi.fn(async (input: string) => `done:${input}`)

    const { result } = renderHook(() =>
      useAsyncIntent(fn, { presentation: "interactive" })
    )

    // Two calls with no `act`/`await` between them - the same fast
    // double-click shape `use-intent.test.tsx` guards against, exercised
    // here since this primitive keeps its own separate guard rather than
    // sharing `useIntent`'s.
    act(() => {
      result.current.start("a")
      result.current.start("a")
    })

    await waitFor(() => {
      expect(summarize(result.current.state)).toBe('succeeded:"done:a"')
    })

    expect(fn.mock.calls).toHaveLength(1)
  })

  it("thundering-herd guard: retry() during an in-flight retry does not double-dispatch", async () => {
    let resolveFn: ((value: string) => void) | undefined
    const fn = vi
      .fn<(input: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockImplementation(
        (input: string) =>
          new Promise<string>((resolve) => {
            resolveFn = (): void => {
              resolve(`done:${input}`)
            }
          })
      )

    const { result } = renderHook(() =>
      useAsyncIntent(fn, { presentation: "interactive" })
    )

    act(() => {
      result.current.start("a")
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
          retry()
          retry()
        })
      },
    })

    await waitFor(() => {
      expect(summarize(result.current.state)).toBe("working")
    })

    act(() => {
      resolveFn?.("a")
    })
    await waitFor(() => {
      expect(summarize(result.current.state)).toBe('succeeded:"done:a"')
    })

    // One dispatch from start(), exactly one from the retry burst.
    expect(fn.mock.calls).toHaveLength(2)
  })

  it("reset() returns a succeeded intent to idle", async () => {
    // eslint-disable-next-line @typescript-eslint/require-await -- fn's contract is Promise<string>; async is the plainest way to satisfy it for a stub with nothing to actually await.
    const fn = vi.fn(async (_input: string) => "done")

    const { result } = renderHook(() =>
      useAsyncIntent(fn, { presentation: "interactive" })
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

  it("start() always reads the latest closure, not the one captured on the first render", async () => {
    // The exact regression `study-nudge-section.tsx`'s `onChange`/
    // `preferences` closure would hit if `fn` were captured once - the ref
    // is kept current by its own effect, mirroring `useIntentEffect`.
    let latest = "first"
    // eslint-disable-next-line @typescript-eslint/require-await -- fn's contract is Promise<string>; async is the plainest way to satisfy it for a stub with nothing to actually await.
    const fn = vi.fn(async (_variables: undefined) => latest)

    const { result, rerender } = renderHook(() =>
      useAsyncIntent(fn, { presentation: "interactive" })
    )

    latest = "second"
    rerender()

    act(() => {
      result.current.start(undefined)
    })

    await waitFor(() => {
      expect(summarize(result.current.state)).toBe('succeeded:"second"')
    })
  })
})
