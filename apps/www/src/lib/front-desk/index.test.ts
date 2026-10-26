import { describe, expect, it } from "vitest"

import { concern, concernsHere, FRONT_DESK_WORDS } from "@/lib/front-desk"

describe("the front desk's concerns", () => {
  it("offers each build only what it can do, one page per concern", () => {
    const ids = (phone: boolean, viewer: boolean): ReadonlyArray<string> =>
      concernsHere({ phone, viewer }).map((each) => each.id)
    expect(ids(true, false)).toEqual(["phone", "home", "appearance"])
    expect(ids(false, true)).toEqual(["appearance"])
    expect(ids(false, false)).toEqual(["appearance", "account"])
  })

  it("gives every concern its own page under the desk", () => {
    for (const id of ["phone", "home", "appearance", "account"] as const) {
      expect(concern(id).to).toBe(`/settings/${id}`)
    }
  })

  it("says what is behind each card in the person's terms", () => {
    const words = [
      ...(["phone", "home", "appearance", "account"] as const).flatMap((id) => [
        concern(id).title,
        concern(id).lead,
      ]),
      ...Object.values(FRONT_DESK_WORDS),
    ]
    for (const said of words) {
      expect(said.trim()).not.toBe("")
      expect(said).not.toMatch(
        /\b(sync|grant|request|status|endpoint|localStorage|route|scope|lane)\b/i
      )
    }
  })
})
