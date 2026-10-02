import { describe, expect, it } from "vitest"

import { isAccountRouteId } from "@/lib/auth/guards"

describe("isAccountRouteId", () => {
  it("names the LAN tools and nothing else", () => {
    expect(isAccountRouteId("/_dashboard/_lan")).toBe(true)
    expect(isAccountRouteId("/_dashboard/_lan/lessons")).toBe(true)
    expect(isAccountRouteId("/_dashboard/sessions/")).toBe(false)
    expect(isAccountRouteId("/_dashboard/_lanx")).toBe(false)
    expect(isAccountRouteId("/")).toBe(false)
  })
})
