/**
 * @vitest-environment jsdom
 *
 * `requireAccount` is `beforeLoad` for the pages that are the account's own.
 * It must send anyone who is not on the account to the passkey screen with
 * this address to come back to, and it must not ask a server about a session
 * for someone who never chose their account.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import { authority } from "@/lib/authority"

const probes = vi.hoisted(() => ({ asked: 0 }))

vi.mock("@/lib/auth/session", () => ({
  resolveSessionIfChosen: (): Promise<boolean> => {
    probes.asked += 1
    return Promise.resolve(false)
  },
}))

const { isAccountRouteId, requireAccount } = await import("@/lib/auth/guards")

beforeEach(() => {
  window.localStorage.clear()
  authority.resetForTests()
  probes.asked = 0
})

describe("requireAccount", () => {
  it("lets the account through", async () => {
    authority.dispatch({ type: "session-started", adopt: true })
    await expect(requireAccount("/lessons")).resolves.toBeUndefined()
  })

  it("sends someone learning on the device to the passkey screen, remembering where they were going", async () => {
    await expect(requireAccount("/lessons?x=1")).rejects.toMatchObject({
      options: { to: "/auth", search: { redirect: "/lessons?x=1" } },
    })
  })

  it("sends someone whose session was lost to the passkey screen too", async () => {
    authority.dispatch({ type: "session-started", adopt: true })
    authority.dispatch({ type: "session-ended", forget: false })
    await expect(requireAccount("/rounds")).rejects.toBeDefined()
  })
})

describe("isAccountRouteId", () => {
  it("names the LAN tools and nothing else", () => {
    expect(isAccountRouteId("/_dashboard/_lan")).toBe(true)
    expect(isAccountRouteId("/_dashboard/_lan/lessons")).toBe(true)
    expect(isAccountRouteId("/_dashboard/sessions/")).toBe(false)
    expect(isAccountRouteId("/_dashboard/_lanx")).toBe(false)
    expect(isAccountRouteId("/")).toBe(false)
  })
})
