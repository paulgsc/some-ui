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

/**
 * What the missed-word debrief teaches with (see `VocabDebriefModal`). Only
 * read when a vocabulary challenge expires unfinished, so it is optional: a
 * host-supplied `words` override (HangulHexGrid's `words` prop) that omits it
 * still plays, it just gets a debrief with the word and its jamo and no prose.
 * The bundled seed below fills it in for every entry.
 */
export type WordPedagogy = {
  /** The English meaning, as short as it can honestly be. */
  gloss: string
  /**
   * One sentence on why this word is worth the player's memory - a homograph
   * to watch for, a minimal pair against another word on the board, a
   * compound it seeds. Deliberately not a dictionary definition: `gloss`
   * already covers "what it means", and a debrief the player reads for five
   * seconds has to earn its space with something they'd otherwise miss.
   */
  note: string
  /** One TOPIK-1-level sentence using the word, with its translation. */
  example: { korean: string; english: string }
}

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
  /** Debrief content shown when this word expires unfinished - see `WordPedagogy`. */
  pedagogy?: WordPedagogy
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
    pedagogy: {
      gloss: "apple",
      note: '사과 is also the everyday word for an apology - 사과하다 means "to apologize", same spelling, unrelated word.',
      example: {
        korean: "사과 한 개 주세요.",
        english: "One apple, please.",
      },
    },
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
    pedagogy: {
      gloss: "grape",
      note: '포도 seeds two words you will meet soon: 포도주 (wine, literally "grape liquor") and 포도알 (a single grape).',
      example: {
        korean: "포도가 정말 달아요.",
        english: "The grapes are really sweet.",
      },
    },
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
    pedagogy: {
      gloss: "banana",
      note: "A loanword, so it is spelled the way Korean hears it: three identical open syllables, ㅂㅏ-ㄴㅏ-ㄴㅏ.",
      example: {
        korean: "저는 아침에 바나나를 먹어요.",
        english: "I eat a banana in the morning.",
      },
    },
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
    pedagogy: {
      gloss: "tomato",
      note: "Another three-open-syllable loanword. ㅌ is the aspirated partner of ㄷ - same mouth shape, a puff of air added.",
      example: {
        korean: "토마토는 과일이 아니에요.",
        english: "A tomato is not a fruit.",
      },
    },
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
    pedagogy: {
      gloss: "coffee",
      note: 'Korean has no /f/, so "coffee" arrives as 커피 - both consonants land on the aspirated pair, ㅋ and ㅍ.',
      example: {
        korean: "커피 한 잔 마실래요?",
        english: "Shall we have a cup of coffee?",
      },
    },
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
    pedagogy: {
      gloss: "milk",
      note: "The easiest word on the board: ㅇ is silent as an onset, so 우유 is nothing but the two vowels ㅜ and ㅠ.",
      example: {
        korean: "우유를 냉장고에 넣어 주세요.",
        english: "Please put the milk in the fridge.",
      },
    },
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
    pedagogy: {
      gloss: "sweet potato",
      note: "Not to be confused with 감자 (potato). 군고구마 - roasted sweet potato - is Korea's winter street food.",
      example: {
        korean: "겨울에는 군고구마가 맛있어요.",
        english: "Roasted sweet potatoes are delicious in winter.",
      },
    },
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
    pedagogy: {
      gloss: "cucumber",
      note: "Four jamo and not one real consonant sound among them: two silent ㅇ onsets carrying ㅗ and ㅣ.",
      example: {
        korean: "오이를 얇게 썰어요.",
        english: "Slice the cucumber thinly.",
      },
    },
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
    pedagogy: {
      gloss: "spider",
      note: "거미 (spider) and 개미 (ant) are a minimal pair - only the first vowel differs, ㅓ against ㅐ.",
      example: {
        korean: "거미가 거미줄을 만들어요.",
        english: "The spider is making a web.",
      },
    },
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
    pedagogy: {
      gloss: "fox",
      note: "Both ㅇ here are silent placeholders, so 여우 sounds like just ㅕ then ㅜ. Calling someone 여우 means they are sly.",
      example: {
        korean: "여우는 꼬리가 길어요.",
        english: "The fox has a long tail.",
      },
    },
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
    pedagogy: {
      gloss: "frog",
      note: 'It opens with 개, which on its own means "dog" - a coincidence of spelling, not a compound. Watch the ㅐ.',
      example: {
        korean: "비가 오면 개구리가 울어요.",
        english: "When it rains, the frogs croak.",
      },
    },
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
    pedagogy: {
      gloss: "butterfly",
      note: '나비 is also the stock name Koreans give a cat, the way English reaches for "Kitty".',
      example: {
        korean: "나비가 꽃에 앉았어요.",
        english: "A butterfly landed on the flower.",
      },
    },
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
    pedagogy: {
      gloss: "duck",
      note: "오리 (duck) against 오이 (cucumber): same opening syllable, and the whole difference is ㄹ versus ㅇ.",
      example: {
        korean: "오리가 물에서 헤엄쳐요.",
        english: "The duck is swimming in the water.",
      },
    },
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
    pedagogy: {
      gloss: "map",
      note: '지도 doubles as "guidance" - 지도하다 is what a teacher or coach does. Context, not spelling, tells them apart.',
      example: {
        korean: "지도를 보고 길을 찾았어요.",
        english: "I found the way by looking at the map.",
      },
    },
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
    pedagogy: {
      gloss: "scissors",
      note: "The 가위 of 가위바위보 (rock-paper-scissors). Note ㅟ: one jamo, but two keys - n then l.",
      example: {
        korean: "가위로 종이를 잘라요.",
        english: "I cut the paper with scissors.",
      },
    },
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
    pedagogy: {
      gloss: "skirt",
      note: "Pairs with 바지 (trousers). ㅊ is the aspirated partner of ㅈ, one key over on the same row.",
      example: {
        korean: "저 치마가 마음에 들어요.",
        english: "I like that skirt.",
      },
    },
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
    pedagogy: {
      gloss: "hat",
      note: "A hat takes 쓰다, not 입다 - Korean picks the verb by where the thing goes, and headwear gets its own.",
      example: {
        korean: "모자를 쓰고 나갔어요.",
        english: "I went out wearing a hat.",
      },
    },
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
    pedagogy: {
      gloss: "tree",
      note: "나무 means both the living tree and the wood it becomes: 나무젓가락 are wooden chopsticks, 소나무 a pine.",
      example: {
        korean: "마당에 나무를 심었어요.",
        english: "I planted a tree in the yard.",
      },
    },
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
    pedagogy: {
      gloss: "bridge",
      note: '다리 is both "bridge" and "leg" - one of the first homographs every learner trips over.',
      example: {
        korean: "다리를 건너서 학교에 가요.",
        english: "I cross the bridge to get to school.",
      },
    },
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
    pedagogy: {
      gloss: "country",
      note: '나라 is the native Korean word; 국가 is its Sino-Korean twin. "Our country" fuses into one word: 우리나라.',
      example: {
        korean: "한국은 아름다운 나라예요.",
        english: "Korea is a beautiful country.",
      },
    },
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
