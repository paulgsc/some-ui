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
  it("is the server only for the account on a build with one", () => {
    expect(clientOwnsNudgeDelivery("server", false, "account")).toBe(false)
    expect(clientOwnsNudgeDelivery("server", false, "local")).toBe(true)
    expect(clientOwnsNudgeDelivery("server", false, "pending")).toBe(true)
  })

  it("is always the client where there is no server, and on the phone", () => {
    expect(clientOwnsNudgeDelivery("static", false, "account")).toBe(true)
    expect(clientOwnsNudgeDelivery("server", true, "account")).toBe(true)
  })

  it("keeps its old meaning for a caller that does not say", () => {
    expect(clientOwnsNudgeDelivery("server", false)).toBe(false)
    expect(clientOwnsNudgeDelivery("static", false)).toBe(true)
  })
})
