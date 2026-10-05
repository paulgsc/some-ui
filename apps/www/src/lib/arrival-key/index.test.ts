/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { useArrivalKey } from "@/lib/arrival-key"

describe("useArrivalKey", () => {
  it("moves when a request arrives, and stays when it is cleared", () => {
    const { result, rerender } = renderHook(
      ({ say }: { say?: string }) => useArrivalKey(say),
      { initialProps: {} }
    )
    const idle = result.current

    rerender({ say: "capture" })
    const first = result.current
    expect(first).not.toBe(idle)

    // Honoured: the page clears `?say=`. Not a new arrival.
    rerender({})
    expect(result.current).toBe(first)

    // The same request again, from the page itself: a new arrival.
    rerender({ say: "capture" })
    expect(result.current).not.toBe(first)
  })

  it("moves when one request replaces another", () => {
    const { result, rerender } = renderHook(
      ({ say }: { say?: string }) => useArrivalKey(say),
      { initialProps: { say: "sessions" } }
    )
    const before = result.current
    rerender({ say: "capture" })
    expect(result.current).not.toBe(before)
  })
})
