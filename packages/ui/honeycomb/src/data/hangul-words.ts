// hangul-words.ts
// Seed vocabulary for VocabularyMode (ADR 0001 §2(d)/#424): a curated word list, each entry a
// multi-token challenge for the generalized engine (epic #420, #421/#422).
//
// Provenance (ADR 0001 §5): every `icon` here is a Unicode-standard emoji glyph - no bundled
// asset, no attribution obligation. `ttsText` is spoken at runtime via the Web Speech API
// (`@honeycomb/lib/hangul/speech`) - generated on the fly, not bundled, so it carries no
// licensing obligation either. No `Image` stimulus is seeded (ADR 0001's own stated preference:
// "Prefer TTS ... and an existing openly-licensed icon set ... over hand-collected images").
//
// Every word is open-syllable (no batchim/final-consonant jamo): `Korean::key_for`
// (crates/hangul-game-core/src/internal/content_domain/korean.rs) only maps the 19 lead
// consonants + 21 vowels, not final-position consonants, so `answerKeys`/`answerGlyphs` below are
// hand-verified against that exact table - a batchim-bearing word would silently produce an
// unmappable/unmatchable token.

export type WordEntry = {
  id: string
  word: string
  romanization: string
  answerKeys: Array<string>
  answerGlyphs: Array<string>
  icon: string
  ttsText: string
  category: "food" | "animal" | "object" | "nature"
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
