/**
 * @vitest-environment node
 */
import { THEME_IDS, THEMES } from "@some-ui/burn-ins/contract"
import { describe, expect, it } from "vitest"

import { editOf, lookIssueUrl, lookNamed, sameLook, withEdit } from "./index"

describe("a caption look set in Studio (SFEED11)", () => {
  it("is every look unchanged until the control changes it", () => {
    for (const id of THEME_IDS) {
      const look = THEMES[id]
      expect(sameLook(withEdit(look, editOf(look)), look)).toBe(true)
    }
    expect(lookNamed("broadcast")).toBe(THEMES.broadcast)
    expect(lookNamed("nothing")).toBeNull()
    expect(lookNamed(null)).toBeNull()
  })

  it("adds a plate with a shape to a look that has none, and takes one away", () => {
    const look = THEMES.gridiron
    const plated = withEdit(look, {
      ...editOf(look),
      plate: { colour: "#112233", opacity: 0.5 },
    })
    expect(plated.plate).toMatchObject({ colour: "#112233", opacity: 0.5 })
    expect(plated.plate?.radiusPx).toBeGreaterThan(0)
    const bare = THEMES.broadcast
    expect(withEdit(bare, { ...editOf(bare), plate: null }).plate).toBeNull()
  })

  it("sends the whole look in the issue it opens, for a session to land", () => {
    const look = withEdit(THEMES.broadcast, {
      ...editOf(THEMES.broadcast),
      sizePx: 72,
    })
    const url = new URL(
      lookIssueUrl(
        { id: "conference-call", title: "The weekly call" },
        "broadcast",
        look
      )
    )
    expect(url.origin + url.pathname).toBe(
      "https://github.com/paulgsc/some-ui/issues/new"
    )
    const block = /```json caption-look\n([\s\S]*?)\n```/.exec(
      url.searchParams.get("body") ?? ""
    )
    expect(JSON.parse(block?.[1] ?? "null")).toEqual(look)
  })
})
