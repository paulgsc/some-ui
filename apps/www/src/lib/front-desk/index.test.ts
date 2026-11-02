import { describe, expect, it } from "vitest"

import {
  concern,
  concernsHere,
  deskBar,
  FRONT_DESK_WORDS,
} from "@/lib/front-desk"
import { MACHINERY } from "@/lib/home-link/__tests__/machinery"

describe("the front desk's concerns", () => {
  it("offers each build only what it can do", () => {
    const ids = (phone: boolean, viewer: boolean): ReadonlyArray<string> =>
      concernsHere({ phone, viewer }).map((each) => each.id)
    expect(ids(true, false)).toEqual([
      "status",
      "phone",
      "home",
      "data",
      "appearance",
    ])
    expect(ids(false, true)).toEqual(["appearance"])
    expect(ids(false, false)).toEqual(["appearance", "account"])
  })

  it("says what is behind each card in the person's terms", () => {
    const words = [
      ...(
        ["status", "phone", "home", "data", "appearance", "account"] as const
      ).flatMap((id) => [concern(id).title, concern(id).tab, concern(id).lead]),
      ...Object.values(FRONT_DESK_WORDS),
    ]
    expect(words.filter((said) => MACHINERY.test(said))).toEqual([])
  })

  it("gives the phone a bar: four pages with a tab, and More for the rest", () => {
    const bar = deskBar({ phone: true, viewer: false })
    expect(bar?.tabs.map((page) => page.tab)).toEqual([
      "Running",
      "Phone",
      "Home",
      "My data",
    ])
    expect(bar?.more.map((page) => page.id)).toEqual(["appearance"])
  })

  it("gives the desktop web and a viewer's build no bar: they have cards", () => {
    expect(deskBar({ phone: false, viewer: false })).toBeNull()
    expect(deskBar({ phone: false, viewer: true })).toBeNull()
  })
})
