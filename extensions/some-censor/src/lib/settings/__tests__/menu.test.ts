/**
 * The tab and toolbar-button menu (#1966): its marks follow what is
 * stored, and each click asks for exactly one thing.
 */

import { menuCommand, menuItems } from "@censor/lib/settings/menu"
import type { Settings } from "@censor/lib/settings/settings"
import { DEFAULT_SETTINGS } from "@censor/lib/settings/settings"
import { describe, expect, it } from "vitest"

const DIAGNOSTICS = { id: "bc-open-diagnostics", title: "Open diagnostics" }

const marks = (settings: Settings): Record<string, boolean> =>
  Object.fromEntries(
    menuItems(settings, DIAGNOSTICS).flatMap((item) =>
      item.checked === undefined ? [] : [[item.id, item.checked]]
    )
  )

describe("menuItems", () => {
  it("marks what is stored, and offers no age", () => {
    expect(marks(DEFAULT_SETTINGS)).toEqual({
      "bc-on": true,
      "bc-mode-strict": false,
      "bc-mode-standard": true,
      "bc-mode-mix": false,
      "bc-autoplay-stops": true,
    })
    expect(
      marks({
        ...DEFAULT_SETTINGS,
        mode: "mix",
        autoplay: "skip",
        enabled: false,
      })
    ).toMatchObject({
      "bc-on": false,
      "bc-mode-mix": true,
      "bc-mode-standard": false,
      "bc-autoplay-stops": false,
    })
    const titles = menuItems(DEFAULT_SETTINGS, DIAGNOSTICS).map((i) => i.title)
    expect(titles.join(" ")).not.toMatch(/older|month|year/i)
  })

  it("fits Firefox's six top-level toolbar items, separators counted", () => {
    const items = menuItems(DEFAULT_SETTINGS, DIAGNOSTICS)
    expect(items.filter((i) => i.parentId === undefined)).toHaveLength(6)
  })

  it("greys out the choices while the extension is off", () => {
    const greyed = (enabled: boolean): Array<string> =>
      menuItems({ ...DEFAULT_SETTINGS, enabled }, DIAGNOSTICS)
        .filter((i) => i.enabled === false)
        .map((i) => i.id)
    expect(greyed(true)).toEqual([])
    expect(greyed(false)).toEqual(["bc-mode", "bc-autoplay-stops"])
  })

  it("puts every mode under Mode, and Diagnostics last", () => {
    const items = menuItems(DEFAULT_SETTINGS, DIAGNOSTICS)
    expect(
      items.filter((i) => i.parentId === "bc-mode").map((i) => i.title)
    ).toEqual(["Strict", "Standard", "Music mix"])
    expect(items.at(-1)).toEqual(DIAGNOSTICS)
  })
})

describe("menuCommand", () => {
  const apply = (id: string, checked?: boolean): Settings | string | null => {
    const command = menuCommand(id, checked, DIAGNOSTICS.id)
    if (command === null) return null
    return command.kind === "change"
      ? command.change(DEFAULT_SETTINGS)
      : command.kind
  }

  it("turns each click into the change it names", () => {
    expect(apply("bc-on", false)).toEqual({
      ...DEFAULT_SETTINGS,
      enabled: false,
    })
    expect(apply("bc-mode-strict")).toEqual({
      ...DEFAULT_SETTINGS,
      mode: "strict",
    })
    expect(apply("bc-autoplay-stops", false)).toEqual({
      ...DEFAULT_SETTINGS,
      autoplay: "skip",
    })
    expect(apply("bc-settings")).toBe("settings")
    expect(apply(DIAGNOSTICS.id)).toBe("diagnostics")
  })

  it("ignores what is not this menu's, and a checkbox with no state", () => {
    expect(apply("someone-else")).toBeNull()
    expect(apply("bc-on")).toBeNull()
  })
})
