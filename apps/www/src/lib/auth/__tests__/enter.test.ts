import { describe, expect, it, vi } from "vitest"

import { enterAccount } from "@/lib/auth"

describe("enterAccount", () => {
  it("loads the page afresh with a server, so nothing in memory crosses accounts", () => {
    const navigate = vi.fn()
    const assign = vi.fn()
    enterAccount("/app", navigate, "server", assign)
    expect(assign).toHaveBeenCalledWith(
      `${import.meta.env.BASE_URL.replace(/\/+$/, "")}/app`
    )
    expect(navigate).not.toHaveBeenCalled()
  })

  it("navigates in place on the static build, whose demo session lives in memory", () => {
    const navigate = vi.fn()
    const assign = vi.fn()
    enterAccount("/app", navigate, "static", assign)
    expect(navigate).toHaveBeenCalledWith("/app")
    expect(assign).not.toHaveBeenCalled()
  })
})
