/**
 * @vitest-environment jsdom
 *
 * `useHasDecorativeSession` exists so providers mounted above the router
 * (the TTS provider, the study nudge watcher) can react to sign-in without
 * a route change to force their re-render - see those two modules for why
 * that mattered: without a subscription, a session query enabled off a
 * one-time `hasDecorativeSession()` read would stay disabled for the rest
 * of the tab's life once flipped true.
 */

import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  vi.resetModules()
})

describe("useHasDecorativeSession", () => {
  it("starts false and flips true, in the same render tree, the moment a session is created", async () => {
    const { createDecorativeSession, useHasDecorativeSession } = await import(
      "./auth-session"
    )
    const { result } = renderHook(() => useHasDecorativeSession())

    expect(result.current).toBe(false)

    act(() => {
      createDecorativeSession()
    })

    expect(result.current).toBe(true)
  })
})
