/**
 * @vitest-environment jsdom
 *
 * The event-driven half of the presence lease: fires on mount and on
 * returning to visible, renews sparsely while visible, and never writes on a
 * fixed interval regardless of tab state — the property #317's server half
 * was sized around and the one most worth pinning here.
 */
import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { reportPresence } from "./presence"
import { usePresenceLease } from "./use-presence-lease"

vi.mock("./presence", () => ({
  reportPresence: vi.fn(),
}))

const RENEWAL_INTERVAL_MS = 45_000

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  })
}

describe("usePresenceLease", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setVisibility("visible")
    vi.mocked(reportPresence).mockClear()
  })

  afterEach(() => {
    // Without this, a hook left mounted by a prior test keeps its
    // `visibilitychange` listener registered on the shared jsdom `document`,
    // and the next test's dispatch fires it too.
    cleanup()
    vi.useRealTimers()
  })

  it("writes a lease immediately when mounted while visible", () => {
    renderHook(() => usePresenceLease("session-1"))

    expect(vi.mocked(reportPresence)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(reportPresence)).toHaveBeenCalledWith("session-1")
  })

  it("writes nothing when there is no session in view", () => {
    renderHook(() => usePresenceLease(undefined))

    expect(vi.mocked(reportPresence)).not.toHaveBeenCalled()
  })

  it("writes nothing on mount while the tab starts out hidden", () => {
    setVisibility("hidden")

    renderHook(() => usePresenceLease("session-1"))

    expect(vi.mocked(reportPresence)).not.toHaveBeenCalled()
  })

  it("renews roughly every 45s while visible", () => {
    renderHook(() => usePresenceLease("session-1"))
    expect(vi.mocked(reportPresence)).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(RENEWAL_INTERVAL_MS)
    expect(vi.mocked(reportPresence)).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(RENEWAL_INTERVAL_MS)
    expect(vi.mocked(reportPresence)).toHaveBeenCalledTimes(3)
  })

  it("stops renewing within one tick of the tab going hidden", () => {
    renderHook(() => usePresenceLease("session-1"))
    expect(vi.mocked(reportPresence)).toHaveBeenCalledTimes(1)

    setVisibility("hidden")
    document.dispatchEvent(new Event("visibilitychange"))

    vi.advanceTimersByTime(5 * RENEWAL_INTERVAL_MS)
    expect(vi.mocked(reportPresence)).toHaveBeenCalledTimes(1)
  })

  it("writes again and resumes renewal on returning to visible", () => {
    renderHook(() => usePresenceLease("session-1"))

    setVisibility("hidden")
    document.dispatchEvent(new Event("visibilitychange"))
    expect(vi.mocked(reportPresence)).toHaveBeenCalledTimes(1)

    setVisibility("visible")
    document.dispatchEvent(new Event("visibilitychange"))
    expect(vi.mocked(reportPresence)).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(RENEWAL_INTERVAL_MS)
    expect(vi.mocked(reportPresence)).toHaveBeenCalledTimes(3)
  })

  it("stops renewing within one tick of navigating away (unmount)", () => {
    const { unmount } = renderHook(() => usePresenceLease("session-1"))
    expect(vi.mocked(reportPresence)).toHaveBeenCalledTimes(1)

    unmount()

    vi.advanceTimersByTime(5 * RENEWAL_INTERVAL_MS)
    expect(vi.mocked(reportPresence)).toHaveBeenCalledTimes(1)
  })

  it("never writes on a fixed interval regardless of visibility", () => {
    setVisibility("hidden")
    renderHook(() => usePresenceLease("session-1"))

    vi.advanceTimersByTime(5 * RENEWAL_INTERVAL_MS)
    expect(vi.mocked(reportPresence)).not.toHaveBeenCalled()
  })
})
