// Shared Storybook fixtures for the Hangul honeycomb components
// (`UI/Honeycomb/Hangul/*`), imported only by `.stories.tsx` files. Local to
// this package: `@some-ui/content` has a "no source code" charter.

import type { Stimulus } from "@honeycomb/lib/hangul/wasm-game-bridge"
import type {
  HangulCharacter,
  MissedWord,
  WordProgress,
} from "@honeycomb/types/hangul-types"

/** A reasonable, consistent on-screen size for an isolated single-cell story. */
export const STORY_HEX_WIDTH = 160

/**
 * A regular hexagon SVG path centered at `(cx, cy)` whose horizontal extent
 * is `width`; close enough for an isolated story.
 */
export function hexPathFor(
  cx: number,
  cy: number,
  width: number = STORY_HEX_WIDTH
): string {
  const r = width / 2
  const points = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i)
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  })
  const [first, ...rest] = points
  if (!first) return ""
  return `M${first.x},${first.y} ${rest.map((p) => `L${p.x},${p.y}`).join(" ")} Z`
}

let mockCharacterCounter = 0

/** A `HangulHexCell`-shaped character - single jamo by default (ADR 0001's degenerate n=1 case). */
export function mockCharacter(
  overrides: Partial<HangulCharacter> = {}
): HangulCharacter {
  mockCharacterCounter += 1
  return {
    id: `story-cell-${mockCharacterCounter}`,
    hangul: "ㄱ",
    qwertyKey: "r",
    romanization: "g/k",
    color: "#3b82f6",
    spawnedAt: Date.now(),
    ...overrides,
  }
}

/** A word challenge's mid-progress snapshot (`PromptStation`). Defaults to 사과 (apple) at cursor 2/4. */

export function mockWordProgress(
  overrides: Partial<WordProgress> = {}
): WordProgress {
  return {
    cellIds: ["hex_0_0_0", "hex_1_-1_0", "hex_-1_1_0", "hex_1_0_-1"],
    answerGlyphs: ["ㅅ", "ㅏ", "ㄱ", "ㅘ"],
    cursor: 2,
    ...overrides,
  }
}

/** A word that expired unfinished (`VocabDebriefModal`). Defaults to 사과 (apple) abandoned at 2 of 4 jamo. */
export function mockMissedWord(
  overrides: Partial<MissedWord> = {}
): MissedWord {
  const { cellIds, answerGlyphs, cursor } = mockWordProgress()
  return { cellIds, answerGlyphs, cursor, ...overrides }
}

/** An `Icon` stimulus keyed by a `HANGUL_WORDS` id (defaults to "apple" - 사과). */
export function mockIconStimulus(name = "apple"): Stimulus {
  return { kind: "icon", name }
}
