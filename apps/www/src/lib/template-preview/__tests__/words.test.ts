/**
 * @vitest-environment node
 *
 * Everything a template's preview says is in the person's terms (CLAUDE.md,
 * "State in the person's terms"): none of it names the machinery behind it.
 */
import { describe, expect, it } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import { PREVIEW_WORDS } from "@/lib/template-preview/words"

function strings(value: unknown): Array<string> {
  if (typeof value === "string") return [value]
  if (typeof value === "object" && value !== null)
    return Object.values(value).flatMap(strings)
  return []
}

describe("PREVIEW_WORDS", () => {
  it("name no machinery, in any line they can say", () => {
    const said = [
      ...strings(PREVIEW_WORDS),
      PREVIEW_WORDS.kept(1_762_588_000, 1_762_674_400, "UTC"),
      PREVIEW_WORDS.bringing(50, 100),
    ]
    for (const line of said) expect(line).not.toMatch(MACHINERY)
  })

  it("say when a preview was made and when home lets it go", () => {
    // 2025-11-08 07:46:40 UTC and a day later.
    expect(PREVIEW_WORDS.kept(1_762_588_000, 1_762_674_400, "UTC")).toBe(
      "Made Sat 7:46 AM. Home lets it go Sun 7:46 AM."
    )
  })
})
