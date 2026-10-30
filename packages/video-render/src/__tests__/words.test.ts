import {
  LOOK_WORDS,
  MUSIC_WORDS,
  SOUND_WORDS,
  TRANSITION_WORDS,
  VOICE_WORDS,
} from "@video-render/words"
import { describe, expect, it } from "vitest"

/** Names the renderer uses that never reach the screen. */
const MACHINERY =
  /ffmpeg|xfade|filter|codec|lavfi|sidechain|push-in|punch-in-at|up-between|as-captured|\bfps\b|-/i

describe("words", () => {
  it("says every choice in the person's terms", () => {
    const said = [
      ...Object.values(TRANSITION_WORDS),
      ...Object.values(SOUND_WORDS),
      ...Object.values(MUSIC_WORDS),
      ...[...Object.values(LOOK_WORDS), ...Object.values(VOICE_WORDS)].flatMap(
        (w) => [w.name, ...w.rows.flatMap((r) => [r.what, r.how])]
      ),
    ]
    for (const words of said) {
      expect(words.replace(/Punch-in|Ad-lib/, "")).not.toMatch(MACHINERY)
    }
  })
})
