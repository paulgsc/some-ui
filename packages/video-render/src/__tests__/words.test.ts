import { LOOK_RULES, LOOKS, VOICES } from "@video-render/plans"
import { LOOK_WORDS, VOICE_WORDS } from "@video-render/words"
import { describe, expect, it } from "vitest"

/** Names the renderer uses that never reach the screen. */
const MACHINERY =
  /ffmpeg|xfade|filter|codec|lavfi|sidechain|crossfade-ms|push-in|punch-in-at|up-between|as-captured|\bfps\b/i

describe("plan words", () => {
  it("names every plan and says what it sets, in the person's terms", () => {
    for (const w of [
      ...LOOKS.map((l) => LOOK_WORDS[l]),
      ...VOICES.map((v) => VOICE_WORDS[v]),
    ]) {
      expect(w.name).not.toBe("")
      expect(w.rows.length).toBeGreaterThan(0)
      for (const r of w.rows)
        expect(`${r.what} ${r.how}`).not.toMatch(MACHINERY)
    }
  })

  it("says the transition each look draws", () => {
    for (const look of LOOKS) {
      const said = LOOK_WORDS[look].rows.find(
        (r) => r.what === "Between scenes"
      )?.how
      expect(said?.toLowerCase().replace(" ", "-")).toBe(
        LOOK_RULES[look].transition
      )
    }
  })
})
