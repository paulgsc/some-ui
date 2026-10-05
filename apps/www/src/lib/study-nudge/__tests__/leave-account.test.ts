/**
 * @vitest-environment jsdom
 *
 * Leaving the account releases this browser's push subscription, and does it
 * without a single request: the account no longer lets a transport out, and a
 * worker must not be registered just to unsubscribe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { authority } from "@/lib/authority"
import { releasePushWhenLeavingTheAccount } from "@/lib/study-nudge/leave-account"
import { clientOwnsNudgeDelivery } from "@/lib/study-nudge/use-study-nudge"

const unsubscribe = vi.fn(() => Promise.resolve(true))
const getRegistration = vi.fn(() =>
  Promise.resolve({
    pushManager: { getSubscription: () => Promise.resolve({ unsubscribe }) },
  })
)
const register = vi.fn()
const fetchSpy = vi.fn()
let release: () => void = () => undefined

/** Let the fire-and-forget unsubscribe settle. */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  window.localStorage.clear()
  authority.resetForTests()
  unsubscribe.mockClear()
  getRegistration.mockClear()
  register.mockClear()
  fetchSpy.mockClear()
  vi.stubGlobal("fetch", fetchSpy)
  vi.stubGlobal("PushManager", class {})
  vi.stubGlobal("Notification", class {})
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration, register },
  })
  release = releasePushWhenLeavingTheAccount()
})

afterEach(() => {
  release()
  vi.unstubAllGlobals()
})

describe("leaving the account", () => {
  it("releases the browser's push subscription when a session expires", async () => {
    authority.dispatch({ type: "session-started", adopt: true })
    await settle()
    expect(unsubscribe).not.toHaveBeenCalled()

    authority.dispatch({ type: "session-ended", forget: false })
    await settle()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it("releases it when the person switches their data to the device", async () => {
    authority.dispatch({ type: "session-started", adopt: true })
    authority.chooseLocal()
    await settle()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it("releases it when the person turns reporting off, and not when they turn it on", async () => {
    authority.dispatch({ type: "session-started", adopt: true })
    authority.setReporting(true)
    await settle()
    expect(unsubscribe).not.toHaveBeenCalled()

    authority.setReporting(false)
    await settle()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it("releases it when another account signs in over one that was reporting", async () => {
    authority.dispatch({ type: "session-started", adopt: true })
    authority.setReporting(true)
    authority.dispatch({ type: "session-started", adopt: true })
    await settle()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it("releases it when a returning account user's session turns out to be gone at boot", async () => {
    // The previous page load had reporting on; this one starts undecided.
    release()
    window.localStorage.setItem(
      "some-ui.authority.v1",
      JSON.stringify({ choice: "account", reporting: true })
    )
    authority.resetForTests()
    expect(authority.getAuthority().kind).toBe("pending")
    release = releasePushWhenLeavingTheAccount()

    authority.dispatch({ type: "session-learned", session: "signed-out" })
    await settle()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it("keeps it through a boot where the session is confirmed, or the server is only unreachable", async () => {
    for (const session of ["signed-in", "unreachable"] as const) {
      release()
      window.localStorage.setItem(
        "some-ui.authority.v1",
        JSON.stringify({ choice: "account", reporting: true })
      )
      authority.resetForTests()
      release = releasePushWhenLeavingTheAccount()
      authority.dispatch({ type: "session-learned", session })
      await settle()
    }
    expect(unsubscribe).not.toHaveBeenCalled()
  })

  it("makes no request and registers no worker to do it", async () => {
    authority.dispatch({ type: "session-started", adopt: true })
    authority.dispatch({ type: "session-ended", forget: true })
    await settle()

    expect(unsubscribe).toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(register).not.toHaveBeenCalled()
  })

  it("does nothing when someone signs in, or another account does", async () => {
    authority.dispatch({ type: "session-started", adopt: true })
    authority.dispatch({ type: "session-started", adopt: true })
    await settle()
    expect(unsubscribe).not.toHaveBeenCalled()
  })

  it("survives a browser that has no worker or refuses to unsubscribe", async () => {
    unsubscribe.mockRejectedValueOnce(new Error("refused"))
    authority.dispatch({ type: "session-started", adopt: true })
    authority.dispatch({ type: "session-ended", forget: false })
    await settle()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe("who delivers a reminder", () => {
  it("is the server only where it hears from the learner, on a build with one", () => {
    expect(clientOwnsNudgeDelivery("server", false, true)).toBe(false)
    expect(clientOwnsNudgeDelivery("server", false, false)).toBe(true)
  })

  it("is always the client where there is no server, and on the phone", () => {
    expect(clientOwnsNudgeDelivery("static", false, true)).toBe(true)
    expect(clientOwnsNudgeDelivery("server", true, true)).toBe(true)
  })

  it("keeps its old meaning for a caller that does not say", () => {
    expect(clientOwnsNudgeDelivery("server", false)).toBe(false)
    expect(clientOwnsNudgeDelivery("static", false)).toBe(true)
  })
})
