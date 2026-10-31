/**
 * @vitest-environment jsdom
 *
 * The wing registry: who owns a path, what a wing's bar holds, and the
 * roots a wing's launcher icon may open.
 */

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  navOf,
  owns,
  ROOMS,
  tabsOf,
  webSettingsOf,
  webWingsHere,
  wingOf,
  WINGS,
} from "@/lib/wings"

let carriesApk = true
let carriesLan = false

vi.mock("@/lib/build-profile", () => ({
  hasAudience: (audience: string): boolean =>
    (audience === "apk" && carriesApk) || (audience === "lan" && carriesLan),
}))

const { entryRoot, listenForWingEntry } = await import("@/lib/wings/entry")

afterEach(() => {
  carriesApk = true
  carriesLan = false
})

describe("owns", () => {
  it("owns a root and what is under it, and not a sibling that shares a prefix", () => {
    expect(owns("/resume", "/resume")).toBe(true)
    expect(owns("/resume", "/resume/print")).toBe(true)
    expect(owns("/resume", "/resume-build")).toBe(false)
  })

  it("owns only itself at /", () => {
    expect(owns("/", "/")).toBe(true)
    expect(owns("/", "/sessions")).toBe(false)
  })
})

describe("wings", () => {
  it("puts a path in its room's wing, and the foyer and front desk in none", () => {
    expect(wingOf("/sessions/42")?.id).toBe("practice")
    expect(wingOf("/practice/settings")?.id).toBe("practice")
    expect(wingOf("/aph/history")?.id).toBe("self")
    expect(wingOf("/journal")?.id).toBe("studio")
    expect(wingOf("/foyer")).toBeUndefined()
    expect(wingOf("/settings")).toBeUndefined()
  })

  it("gives each room exactly one wing that exists", () => {
    const ids = new Set(WINGS.map((wing) => wing.id))
    for (const room of ROOMS) expect(ids.has(room.wing), room.id).toBe(true)
  })

  it("gives a wing's Home and settings to that wing", () => {
    for (const wing of WINGS) {
      if (wing.home !== null) expect(wingOf(wing.home)?.id).toBe(wing.id)
      if (wing.settings !== null)
        expect(wingOf(wing.settings)?.id).toBe(wing.id)
      if (wing.web !== null) expect(wingOf(wing.web.home)?.id).toBe(wing.id)
    }
  })

  it("offers the public site's foyer the wings viewers try, and no home network wing", () => {
    expect(webWingsHere().map((wing) => wing.id)).toEqual([
      "practice",
      "studio",
      "jobs",
    ])
  })

  it("offers the home network's foyer no study or making wing (ADM1)", () => {
    carriesLan = true
    expect(webWingsHere().map((wing) => wing.id)).toEqual(["jobs"])
  })

  it("lists only a wing's own rooms in its web sidebar", () => {
    const wing = (id: string): (typeof WINGS)[number] => {
      const found = WINGS.find((w) => w.id === id)
      if (!found) throw new Error(id)
      return found
    }
    expect(navOf(wing("practice")).map((room) => room.nav)).toEqual([
      "Home",
      "Sessions",
      "Profile",
    ])
    expect(webSettingsOf(wing("practice"))).toBe("/practice/settings")
    expect(navOf(wing("self"))).toEqual([])
    expect(webSettingsOf(wing("self"))).toBeNull()
    // The home network's rooms only where the build carries them (A3).
    expect(navOf(wing("operate"))).toEqual([])
    // The home network's build carries them, and offers no making (ADM1):
    // study and making leave its sidebar, while their routes still load.
    carriesLan = true
    expect(navOf(wing("operate"))).toEqual([])
    expect(navOf(wing("practice"))).toEqual([])
    expect(webSettingsOf(wing("practice"))).toBeNull()
    expect(navOf(wing("studio"))).toEqual([])
    expect(navOf(wing("jobs")).map((room) => room.nav)).toEqual(["Morning run"])
  })

  it("has no tabs in a build without the phone's pages (A3)", () => {
    carriesApk = false
    expect(tabsOf("practice")).toEqual([])
  })
})

describe("wing entry", () => {
  it("knows the foyer and each wing's Home, and nothing else", () => {
    expect(entryRoot("/aph")).toBe("/aph")
    expect(entryRoot("/settings")).toBeUndefined()
    expect(entryRoot("https://example.com")).toBeUndefined()
    expect(entryRoot(undefined)).toBeUndefined()
  })

  it("navigates to the root a wing's icon sends, and ignores anything else", () => {
    const navigate = vi.fn()
    listenForWingEntry(navigate)

    window.dispatchEvent(
      Object.assign(new Event("someui:wing"), { root: "/aph" })
    )
    window.dispatchEvent(
      Object.assign(new Event("someui:wing"), { root: "/settings" })
    )
    window.dispatchEvent(new Event("someui:wing"))

    expect(navigate.mock.calls).toEqual([["/aph"]])
  })

  it("listens for nothing in a build without the phone's pages", () => {
    carriesApk = false
    const add = vi.spyOn(window, "addEventListener")
    listenForWingEntry(vi.fn())

    expect(add).not.toHaveBeenCalledWith("someui:wing", expect.anything())
    add.mockRestore()
  })
})
