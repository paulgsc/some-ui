// hangul-words.ts
// Seed vocabulary for VocabularyMode (ADR 0001 §2(d)/#424): a curated word list, each entry a
// multi-token challenge for the generalized engine (epic #420, #421/#422).
//
// Provenance (ADR 0001 §5): every `icon` here is a Unicode-standard emoji glyph - no bundled
// asset, no attribution obligation. `ttsText` is spoken at runtime via the Web Speech API
// (`@honeycomb/lib/hangul/speech`) - generated on the fly, not bundled, so it carries no
// licensing obligation either. No `Image` stimulus is seeded (ADR 0001's own stated preference:
// "Prefer TTS ... and an existing openly-licensed icon set ... over hand-collected images").
// Every entry's stimulus is `Icon` - `ttsText`/`romanization` are additional enrichment the
// Prompt/Concept Station (#762) escalates to on struggle, not separate stimulus kinds.
//
// `answerKeys`/`answerGlyphs` below are each word's full jamo stream in typing order, hand-verified
// against `Korean::key_for`'s table (crates/hangul-game-core/src/internal/content_domain/korean.rs)
// - not derived from `word` at runtime; the engine never calls `key_for` for vocabulary-mode
// challenges (see `VocabularyMode::get_next_challenge`), it matches whatever token sequence a seed
// supplies, verbatim. `key_for` is position-agnostic (19 consonants + 21 vowels, 7 of the vowels
// composite), so batchim jamo decompose and play exactly like any other jamo - there is no
// open-syllable restriction. (An earlier version of this comment claimed otherwise; disproven by
// `batchim_word_completes_like_any_other_multi_token_challenge` in engine.rs's test module.) The
// one real gap is `key_for` having no entry for a *compound* batchim as a single character
// (ㄳ/ㄵ/ㄶ/ㄺ/ㄻ/ㄼ/ㄽ/ㄾ/ㄿ/ㅀ/ㅄ) - since nothing validates answerKeys against key_for at
// runtime either, represent one as a single glyph slot with its two component keys concatenated
// (e.g. 닭's ㄺ -> glyph "ㄺ", key "fr"), the same convention the composite vowels above already
// use (e.g. ㅘ -> key "hk"). Verified working end to end by
// `compound_batchim_as_one_glyph_with_a_combined_key_completes_too`, also in engine.rs.

import type { ChallengeSeed } from "@honeycomb/lib/hangul/wasm-game-bridge"

export type WordEntry = {
  id: string
  word: string
  romanization: string
  answerKeys: Array<string>
  answerGlyphs: Array<string>
  icon: string
  ttsText: string
  /**
   * Free-form grouping label - purely descriptive, never read by the engine
   * or any component (grep confirms no `.category` reader exists outside
   * this file). Deliberately `string`, not a closed union: the demo set
   * below happens to use "food"/"animal"/"object"/"nature", but a
   * host-supplied `words` override (HangulHexGrid's `words` prop) is free to
   * use whatever topic labels it wants (e.g. "numbers", "calendar").
   */
  category: string
}

export const HANGUL_WORDS: Array<WordEntry> = [
  {
    id: "apple",
    word: "사과",
    romanization: "sagwa",
    answerKeys: ["t", "k", "r", "hk"],
    answerGlyphs: ["ㅅ", "ㅏ", "ㄱ", "ㅘ"],
    icon: "🍎",
    ttsText: "사과",
    category: "food",
  },
  {
    id: "grape",
    word: "포도",
    romanization: "podo",
    answerKeys: ["v", "h", "e", "h"],
    answerGlyphs: ["ㅍ", "ㅗ", "ㄷ", "ㅗ"],
    icon: "🍇",
    ttsText: "포도",
    category: "food",
  },
  {
    id: "banana",
    word: "바나나",
    romanization: "banana",
    answerKeys: ["q", "k", "s", "k", "s", "k"],
    answerGlyphs: ["ㅂ", "ㅏ", "ㄴ", "ㅏ", "ㄴ", "ㅏ"],
    icon: "🍌",
    ttsText: "바나나",
    category: "food",
  },
  {
    id: "tomato",
    word: "토마토",
    romanization: "tomato",
    answerKeys: ["x", "h", "a", "k", "x", "h"],
    answerGlyphs: ["ㅌ", "ㅗ", "ㅁ", "ㅏ", "ㅌ", "ㅗ"],
    icon: "🍅",
    ttsText: "토마토",
    category: "food",
  },
  {
    id: "coffee",
    word: "커피",
    romanization: "keopi",
    answerKeys: ["z", "j", "v", "l"],
    answerGlyphs: ["ㅋ", "ㅓ", "ㅍ", "ㅣ"],
    icon: "☕",
    ttsText: "커피",
    category: "food",
  },
  {
    id: "milk",
    word: "우유",
    romanization: "uyu",
    answerKeys: ["d", "n", "d", "b"],
    answerGlyphs: ["ㅇ", "ㅜ", "ㅇ", "ㅠ"],
    icon: "🥛",
    ttsText: "우유",
    category: "food",
  },
  {
    id: "sweet-potato",
    word: "고구마",
    romanization: "goguma",
    answerKeys: ["r", "h", "r", "n", "a", "k"],
    answerGlyphs: ["ㄱ", "ㅗ", "ㄱ", "ㅜ", "ㅁ", "ㅏ"],
    icon: "🍠",
    ttsText: "고구마",
    category: "food",
  },
  {
    id: "cucumber",
    word: "오이",
    romanization: "oi",
    answerKeys: ["d", "h", "d", "l"],
    answerGlyphs: ["ㅇ", "ㅗ", "ㅇ", "ㅣ"],
    icon: "🥒",
    ttsText: "오이",
    category: "food",
  },
  {
    id: "spider",
    word: "거미",
    romanization: "geomi",
    answerKeys: ["r", "j", "a", "l"],
    answerGlyphs: ["ㄱ", "ㅓ", "ㅁ", "ㅣ"],
    icon: "🕷️",
    ttsText: "거미",
    category: "animal",
  },
  {
    id: "fox",
    word: "여우",
    romanization: "yeou",
    answerKeys: ["d", "u", "d", "n"],
    answerGlyphs: ["ㅇ", "ㅕ", "ㅇ", "ㅜ"],
    icon: "🦊",
    ttsText: "여우",
    category: "animal",
  },
  {
    id: "frog",
    word: "개구리",
    romanization: "gaeguri",
    answerKeys: ["r", "o", "r", "n", "f", "l"],
    answerGlyphs: ["ㄱ", "ㅐ", "ㄱ", "ㅜ", "ㄹ", "ㅣ"],
    icon: "🐸",
    ttsText: "개구리",
    category: "animal",
  },
  {
    id: "butterfly",
    word: "나비",
    romanization: "nabi",
    answerKeys: ["s", "k", "q", "l"],
    answerGlyphs: ["ㄴ", "ㅏ", "ㅂ", "ㅣ"],
    icon: "🦋",
    ttsText: "나비",
    category: "animal",
  },
  {
    id: "duck",
    word: "오리",
    romanization: "ori",
    answerKeys: ["d", "h", "f", "l"],
    answerGlyphs: ["ㅇ", "ㅗ", "ㄹ", "ㅣ"],
    icon: "🦆",
    ttsText: "오리",
    category: "animal",
  },
  {
    id: "map",
    word: "지도",
    romanization: "jido",
    answerKeys: ["w", "l", "e", "h"],
    answerGlyphs: ["ㅈ", "ㅣ", "ㄷ", "ㅗ"],
    icon: "🗺️",
    ttsText: "지도",
    category: "object",
  },
  {
    id: "scissors",
    word: "가위",
    romanization: "gawi",
    answerKeys: ["r", "k", "d", "nl"],
    answerGlyphs: ["ㄱ", "ㅏ", "ㅇ", "ㅟ"],
    icon: "✂️",
    ttsText: "가위",
    category: "object",
  },
  {
    id: "skirt",
    word: "치마",
    romanization: "chima",
    answerKeys: ["c", "l", "a", "k"],
    answerGlyphs: ["ㅊ", "ㅣ", "ㅁ", "ㅏ"],
    icon: "👗",
    ttsText: "치마",
    category: "object",
  },
  {
    id: "hat",
    word: "모자",
    romanization: "moja",
    answerKeys: ["a", "h", "w", "k"],
    answerGlyphs: ["ㅁ", "ㅗ", "ㅈ", "ㅏ"],
    icon: "🎩",
    ttsText: "모자",
    category: "object",
  },
  {
    id: "tree",
    word: "나무",
    romanization: "namu",
    answerKeys: ["s", "k", "a", "n"],
    answerGlyphs: ["ㄴ", "ㅏ", "ㅁ", "ㅜ"],
    icon: "🌳",
    ttsText: "나무",
    category: "nature",
  },
  {
    id: "bridge",
    word: "다리",
    romanization: "dari",
    answerKeys: ["e", "k", "f", "l"],
    answerGlyphs: ["ㄷ", "ㅏ", "ㄹ", "ㅣ"],
    icon: "🌉",
    ttsText: "다리",
    category: "nature",
  },
  {
    id: "country",
    word: "나라",
    romanization: "nara",
    answerKeys: ["s", "k", "f", "k"],
    answerGlyphs: ["ㄴ", "ㅏ", "ㄹ", "ㅏ"],
    icon: "🌍",
    ttsText: "나라",
    category: "nature",
  },
]

/**
 * A `WordEntry` as the engine's `ChallengeSeed` wire shape (canon Def. 6.1's `Challenge`).
 * `identity` is the entry's stable slug, not its Hangul text - two entries could in principle
 * share display text, but ids are unique by construction. `stimulus.name` carries the same slug,
 * so `#762`'s Prompt Station can look the full `WordEntry` back up from an active challenge's
 * `Stimulus` alone (`HANGUL_WORDS.find(w => w.id === stimulus.name)`).
 */
export function toChallengeSeed(entry: WordEntry): ChallengeSeed {
  return {
    stimulus: { kind: "icon", name: entry.id },
    answerKeys: entry.answerKeys,
    answerGlyphs: entry.answerGlyphs,
    identity: entry.id,
  }
}

export const HANGUL_WORD_POOL: Array<ChallengeSeed> =
  HANGUL_WORDS.map(toChallengeSeed)
