/**
 * @vitest-environment node
 */
import { SESSION_THEME_IDS } from "@some-ui/styles/theme"
import { describe, expect, it } from "vitest"

import { MARK_THEMES, markIssueUrl, themeName } from "./index"

const CALL = { id: "conference-call", title: "The weekly call" }

const bodyOf = (url: string): string =>
  new URL(url).searchParams.get("body") ?? ""

describe("the mark's theme set in Studio (SFEED14)", () => {
  it("offers every theme of the app's, Mochi Night included, by its name", () => {
    expect(MARK_THEMES).toEqual(SESSION_THEME_IDS)
    expect(themeName("mochi-night")).toBe("Mochi Night")
  })

  it("sends the chosen theme in the issue it opens, for a session to land", () => {
    const url = markIssueUrl(CALL, "mochi-night", "mochi")
    expect(new URL(url).origin + new URL(url).pathname).toBe(
      "https://github.com/paulgsc/some-ui/issues/new"
    )
    const block = /```json mark-theme\n([\s\S]*?)\n```/.exec(bodyOf(url))
    expect(JSON.parse(block?.[1] ?? "null")).toEqual({
      brand: { theme: "mochi" },
    })
    expect(bodyOf(url)).toContain("changed from Mochi Night (`mochi-night`)")
  })

  it("says a mark drawn in the app's own theme was", () => {
    expect(bodyOf(markIssueUrl(CALL, undefined, "dark"))).toContain(
      "changed from the app's own theme"
    )
  })
})
