import { describe, expect, it } from "vitest"

import { concern, concernsHere, FRONT_DESK_WORDS } from "@/lib/front-desk"
import { MACHINERY } from "@/lib/home-link/__tests__/machinery"

describe("the front desk's concerns", () => {
  it("offers each build only what it can do", () => {
    const ids = (phone: boolean, viewer: boolean): ReadonlyArray<string> =>
      concernsHere({ phone, viewer }).map((each) => each.id)
    expect(ids(true, false)).toEqual(["status", "phone", "home", "appearance"])
    expect(ids(false, true)).toEqual(["appearance"])
    expect(ids(false, false)).toEqual(["appearance", "account"])
  })

  it("says what is behind each card in the person's terms", () => {
    const words = [
      ...(
        ["status", "phone", "home", "appearance", "account"] as const
      ).flatMap((id) => [concern(id).title, concern(id).lead]),
      ...Object.values(FRONT_DESK_WORDS),
    ]
    expect(words.filter((said) => MACHINERY.test(said))).toEqual([])
  })
})
