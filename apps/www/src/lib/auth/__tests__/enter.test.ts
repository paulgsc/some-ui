import { describe, expect, it, vi } from "vitest"

import { enterAccount } from "@/lib/auth"

const base = import.meta.env.BASE_URL.replace(/\/+$/, "")
const here = "https://app.test/auth?redirect=x"

describe("enterAccount", () => {
  it("loads the page afresh with a server, so nothing in memory crosses accounts", () => {
    const navigate = vi.fn()
    const assign = vi.fn()
    enterAccount("/app?tab=1#top", navigate, "server", assign, here)
    expect(assign).toHaveBeenCalledWith(`${base}/app?tab=1#top`)
    expect(navigate).not.toHaveBeenCalled()
  })

  it.each(["/\\evil.example", "/\\\\evil.example/app", "//evil.example"])(
    "never leaves this origin, whatever %j resolves to",
    (redirect) => {
      const assign = vi.fn()
      enterAccount(redirect, vi.fn(), "server", assign, here)
      expect(assign).toHaveBeenCalledWith(`${base}/app`)
    }
  )

  it("navigates in place on the static build, whose demo session lives in memory", () => {
    const navigate = vi.fn()
    const assign = vi.fn()
    enterAccount("/app", navigate, "static", assign, here)
    expect(navigate).toHaveBeenCalledWith("/app")
    expect(assign).not.toHaveBeenCalled()
  })
})
