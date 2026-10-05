/**
 * @vitest-environment jsdom
 */

import { queryClientWrapper } from "@/test-support/query-client"
import { useMutation } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useIntent } from "@/lib/intent/use-intent"
import { useIntentEffect } from "@/lib/intent/use-intent-effect"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("useIntentEffect", () => {
  it("fires once when the intent transitions to succeeded, and navigate-on-success works", async () => {
    const wrapper = queryClientWrapper()
    const onSucceeded = vi.fn()
    // eslint-disable-next-line @typescript-eslint/require-await -- mutationFn's contract is Promise<T>; async is the plainest way to satisfy it for a stub with nothing to actually await.
    const mutationFn = vi.fn(async (input: string) => `created:${input}`)

    const { result, rerender } = renderHook(
      () => {
        const intent = useIntent(useMutation({ mutationFn }), {
          presentation: "interactive",
        })
        useIntentEffect(intent.state, onSucceeded)
        return intent
      },
      { wrapper }
    )

    act(() => {
      result.current.start("session-a")
    })

    await waitFor(() => {
      expect(onSucceeded).toHaveBeenCalledTimes(1)
    })
    expect(onSucceeded).toHaveBeenCalledWith("created:session-a")

    // Re-rendering while still succeeded (the parent component re-rendering
    // for an unrelated reason, say) must not re-fire the effect - this is
    // the whole point of comparing the carried value rather than the
    // Intent's own object identity, which is fresh every render.
    rerender()
    rerender()
    expect(onSucceeded).toHaveBeenCalledTimes(1)
  })

  it("does not fire for idle, working, or failed", async () => {
    const wrapper = queryClientWrapper()
    const onSucceeded = vi.fn()
    const mutationFn = vi
      .fn<(input: string) => Promise<string>>()
      .mockRejectedValue(new Error("boom"))

    const { result } = renderHook(
      () => {
        const intent = useIntent(useMutation({ mutationFn }), {
          presentation: "interactive",
        })
        useIntentEffect(intent.state, onSucceeded)
        return intent
      },
      { wrapper }
    )

    // idle
    expect(onSucceeded).not.toHaveBeenCalled()

    act(() => {
      result.current.start("session-a")
    })
    // working, briefly, then failed
    await waitFor(() => {
      expect(mutationFn).toHaveBeenCalled()
    })

    expect(onSucceeded).not.toHaveBeenCalled()
  })

  it("fires again for a genuinely new success after a prior one", async () => {
    const wrapper = queryClientWrapper()
    const onSucceeded = vi.fn()
    // eslint-disable-next-line @typescript-eslint/require-await -- mutationFn's contract is Promise<T>; async is the plainest way to satisfy it for a stub with nothing to actually await.
    const mutationFn = vi.fn(async (input: string) => `created:${input}`)

    const { result } = renderHook(
      () => {
        const intent = useIntent(useMutation({ mutationFn }), {
          presentation: "interactive",
        })
        useIntentEffect(intent.state, onSucceeded)
        return intent
      },
      { wrapper }
    )

    act(() => {
      result.current.start("first")
    })
    await waitFor(() => {
      expect(onSucceeded).toHaveBeenCalledTimes(1)
    })

    act(() => {
      result.current.reset()
    })
    act(() => {
      result.current.start("second")
    })

    await waitFor(() => {
      expect(onSucceeded).toHaveBeenCalledTimes(2)
    })
    expect(onSucceeded).toHaveBeenNthCalledWith(1, "created:first")
    expect(onSucceeded).toHaveBeenNthCalledWith(2, "created:second")
  })
})
