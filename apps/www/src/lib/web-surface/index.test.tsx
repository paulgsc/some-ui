/**
 * @vitest-environment jsdom
 *
 * The door (A4, packages/some-vite-config/AUDIENCES.md): the web builds get
 * Hangul Honeycomb's panel and the extensions comb, and a build without a web
 * surface gets something inert in their place. Vitest builds the `lan`
 * profile; the Android app's build is stood in for by its flag, and a
 * profile without "web" by mocking `@/lib/build-profile`.
 */

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as WebSurface from "."

async function loadDoor({
  device = false,
  web = true,
}: { device?: boolean; web?: boolean } = {}): Promise<typeof WebSurface> {
  vi.resetModules()
  vi.stubEnv("VITE_DEVICE_BACKEND", device ? "true" : "")
  vi.doMock("@/lib/build-profile", () => ({
    hasAudience: (audience: string): boolean =>
      audience === "public" || (audience === "web" && web),
  }))
  return import(".")
}

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.doUnmock("@/lib/build-profile")
  vi.resetModules()
})

const isLazy = (component: unknown): boolean =>
  typeof component === "object" &&
  component !== null &&
  Reflect.get(component, "$$typeof") === Symbol.for("react.lazy")

describe("a web build", () => {
  it("binds Hangul Honeycomb's panel and the extensions comb", async () => {
    const { ExtensionsComb, WEB_PANELS } = await loadDoor()

    expect(Object.keys(WEB_PANELS)).toEqual(["hangul"])
    expect(isLazy(ExtensionsComb)).toBe(true)
  })
})

describe("a build with no web surface", () => {
  it.each([
    ["the Android app's", { device: true, web: false }],
    ["a mobile dev server's (no device flag)", { device: false, web: false }],
    ["the device flag alone", { device: true, web: true }],
  ])("binds nothing in %s", async (_, build) => {
    const { ExtensionsComb, WEB_PANELS } = await loadDoor(build)

    expect(WEB_PANELS).toEqual({})
    const { container } = render(<ExtensionsComb />)
    expect(container.innerHTML).toBe("")
  })
})
