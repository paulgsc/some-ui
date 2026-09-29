/**
 * The deck the read-aloud drill ships with: the starter deck's lines, then
 * the level-one lines, over one vocabulary (adaptive-learning canon
 * Def. 4.8, Cor. 4.6).
 *
 * Each word is named once, by its authored id (Def. 1.3): the level-one
 * lines reuse the starter's words rather than naming them again, so a word
 * keeps one pace wherever it is read (Cor. 4.6 (iii)).
 */

import type { ReadAloudDeck } from "@topik/lib/topik/read-aloud/content"
import {
  LEVEL_ONE_LINES,
  LEVEL_ONE_WORDS,
} from "@topik/lib/topik/read-aloud/level-one"
import { STARTER_DECK } from "@topik/lib/topik/read-aloud/starter"

export const BUNDLED_DECK: ReadAloudDeck = {
  id: "bundled",
  title: "Read-aloud: starter and level one",
  words: [...STARTER_DECK.words, ...LEVEL_ONE_WORDS],
  lines: [...STARTER_DECK.lines, ...LEVEL_ONE_LINES],
}
