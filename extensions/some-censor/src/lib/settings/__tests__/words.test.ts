/**
 * Every word the popup, the settings page and the menu say (#1966) is in
 * the person's terms: no internal name, state or mechanism reaches them
 * (CLAUDE.md, "State in the person's terms").
 */

import { MODES } from "@censor/lib/settings/settings"
import * as WORDS from "@censor/lib/settings/words"
import { describe, expect, it } from "vitest"

function strings(value: unknown): Array<string> {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(strings)
  }
  return []
}

describe("words", () => {
  const all = strings(WORDS)

  it("says nothing of the machinery", () => {
    for (const text of all) {
      expect(text, text).not.toMatch(
        /\b(rules?|lane|signs?|core|data-|stamp|boyo|storage|sync|true|false|null|undefined|held view|plate)\b/i
      )
    }
  })

  it("gives every mode one value per row", () => {
    for (const mode of MODES) {
      expect(WORDS.MODE_WORDS[mode].rows).toHaveLength(WORDS.MODE_ROWS.length)
    }
  })
})
