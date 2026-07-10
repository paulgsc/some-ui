import { afterEach, describe, expect, it, vi } from "vitest"

import { resolveRuntimeMode } from "./runtime-mode"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("resolveRuntimeMode", () => {
  it("returns an explicit mode override without looking at window", () => {
    expect(resolveRuntimeMode({ mode: "server" })).toBe("server")
    expect(resolveRuntimeMode({ mode: "static" })).toBe("static")
  })

  it("falls back to static when there is no window (SSR/tests/non-browser)", () => {
    expect(resolveRuntimeMode()).toBe("static")
  })

  it("resolves to server on a recognized local-dev hostname", () => {
    vi.stubGlobal("window", { location: { hostname: "localhost" } })
    expect(resolveRuntimeMode()).toBe("server")
  })

  it("resolves to static on any other hostname", () => {
    vi.stubGlobal("window", {
      location: { hostname: "paulgsc.github.io" },
    })
    expect(resolveRuntimeMode()).toBe("static")
  })

  it("honors a custom serverHostnames list", () => {
    vi.stubGlobal("window", { location: { hostname: "dev.local" } })
    expect(resolveRuntimeMode()).toBe("static")
    expect(resolveRuntimeMode({ serverHostnames: ["dev.local"] })).toBe(
      "server"
    )
  })
})
