/**
 * The seed shelf (KP3, #2852): short, common expressions, each written once
 * with its English and its parts, and every one `proposed` until the owner
 * accepts it. An identifier is identity (canon Def. 1.3): `PHRASE_IDS` lists
 * them in the order they were added, and the test pins every one that has
 * landed. Written by a session (call C1341), never generated at runtime.
 */

import type { Phrase } from "@topik/lib/topik/phrases"

/** The identifiers, in the order they were added. Append only. */
export const PHRASE_IDS = [
  "ph.where-is-my-phone",
  "ph.rained-so-stayed-home",
  "ph.shall-we-eat-together",
  "ph.this-is-really-good",
  "ph.please-sit-here",
  "ph.cold-so-shall-we-go-in",
  "ph.i-dont-really-know",
  "ph.its-okay",
  "ph.bit-busy-today",
  "ph.did-you-eat",
  "ph.pricey-but-good",
  "ph.going-to-eat",
  "ph.will-it-rain-tomorrow",
  "ph.i-didnt-know",
] as const

export type PhraseId = (typeof PHRASE_IDS)[number]

export const isPhraseId = (id: string): id is PhraseId =>
  PHRASE_IDS.some((landed) => landed === id)

export const PHRASES = {
  "ph.where-is-my-phone": {
    korean: "내 폰 어디 있지?",
    intents: [
      "where's my phone",
      "where did I put my phone",
      "I can't find my phone",
    ],
    register: "반말",
    toWhom: "yourself",
    setting: "everyday · looking for something",
    mood: "question",
    parts: [
      { kind: "word", written: "내", lemma: "나", gloss: "my" },
      { kind: "word", written: "폰", lemma: "폰", gloss: "phone" },
      { kind: "word", written: "어디", lemma: "어디", gloss: "where" },
      {
        kind: "built",
        reading: {
          dictionary: "있다",
          ending: "close.ji.checking",
          tense: "none",
        },
        gloss: "be (somewhere)",
      },
    ],
    hear: "ai-voice",
    status: "proposed",
  },
  "ph.rained-so-stayed-home": {
    korean: "비가 와서 집에 있었어요.",
    intents: [
      "because it rained, I stayed home",
      "it rained, so I stayed in",
      "I stayed home because of the rain",
    ],
    register: "해요",
    toWhom: "anyone",
    setting: "everyday · saying why",
    mood: "statement",
    parts: [
      { kind: "word", written: "비가", lemma: "비", gloss: "rain" },
      {
        kind: "built",
        reading: {
          dictionary: "오다",
          ending: "conn.aseo.cause",
          tense: "none",
        },
        gloss: "come (rain falls)",
      },
      { kind: "word", written: "집에", lemma: "집", gloss: "at home" },
      {
        kind: "built",
        reading: {
          dictionary: "있다",
          ending: "close.ayo.plain",
          tense: "past",
        },
        gloss: "be (somewhere), stay",
      },
    ],
    hear: "ai-voice",
    status: "proposed",
  },
  "ph.shall-we-eat-together": {
    korean: "같이 먹을까요?",
    intents: [
      "shall we eat together",
      "want to eat with me",
      "let's eat together",
    ],
    register: "해요",
    toWhom: "anyone",
    setting: "a meal · asking someone along",
    mood: "suggestion",
    parts: [
      { kind: "word", written: "같이", lemma: "같이", gloss: "together" },
      {
        kind: "built",
        reading: {
          dictionary: "먹다",
          ending: "close.lkkayo.proposing",
          tense: "none",
        },
        gloss: "eat",
      },
    ],
    hear: "ai-voice",
    status: "proposed",
  },
  "ph.this-is-really-good": {
    korean: "이거 정말 맛있네요.",
    intents: [
      "this is really good",
      "oh, this is delicious",
      "wow, this tastes great",
    ],
    register: "해요",
    toWhom: "anyone",
    setting: "a meal · tasting something",
    mood: "statement",
    parts: [
      { kind: "word", written: "이거", lemma: "이거", gloss: "this" },
      { kind: "word", written: "정말", lemma: "정말", gloss: "really" },
      {
        kind: "built",
        reading: {
          dictionary: "맛있다",
          ending: "close.neyo.noticing",
          tense: "none",
        },
        gloss: "be tasty",
      },
    ],
    hear: "ai-voice",
    status: "proposed",
  },
  "ph.please-sit-here": {
    korean: "여기 앉으세요.",
    intents: ["please sit here", "have a seat here", "sit down here"],
    register: "해요",
    toWhom: "anyone",
    setting: "a visit · welcoming someone",
    mood: "command",
    parts: [
      { kind: "word", written: "여기", lemma: "여기", gloss: "here" },
      {
        kind: "built",
        reading: {
          dictionary: "앉다",
          ending: "close.seyo.asking",
          tense: "none",
        },
        gloss: "sit",
      },
    ],
    hear: "ai-voice",
    status: "proposed",
  },
  "ph.cold-so-shall-we-go-in": {
    korean: "추우니까 들어갈까요?",
    intents: [
      "it's cold, so shall we go in",
      "it's cold, let's go inside",
      "shall we go in, since it's cold",
    ],
    register: "해요",
    toWhom: "anyone",
    setting: "outdoors · the weather turns",
    mood: "suggestion",
    parts: [
      {
        kind: "built",
        reading: {
          dictionary: "춥다",
          ending: "conn.nikka.cause",
          tense: "none",
        },
        gloss: "be cold",
      },
      {
        kind: "built",
        reading: {
          dictionary: "들어가다",
          ending: "close.lkkayo.proposing",
          tense: "none",
        },
        gloss: "go in",
      },
    ],
    hear: "ai-voice",
    status: "proposed",
  },
  // 모르겠어요's -겠- softens the statement and is no future; conjugation's
  // tense names the form, -겠-, not its meaning here.
  "ph.i-dont-really-know": {
    korean: "잘 모르겠어요.",
    intents: ["I don't really know", "I'm not sure", "I couldn't say"],
    register: "해요",
    toWhom: "anyone",
    setting: "everyday · being asked something",
    mood: "statement",
    parts: [
      { kind: "word", written: "잘", lemma: "잘", gloss: "well" },
      {
        kind: "built",
        reading: {
          dictionary: "모르다",
          ending: "close.ayo.plain",
          tense: "future",
        },
        gloss: "not know",
      },
    ],
    hear: "ai-voice",
    status: "proposed",
  },
  "ph.its-okay": {
    korean: "괜찮아요.",
    intents: ["it's okay", "I'm fine", "no worries", "that's all right"],
    register: "해요",
    toWhom: "anyone",
    setting: "everyday · answering an apology or an offer",
    mood: "statement",
    parts: [
      {
        kind: "built",
        reading: {
          dictionary: "괜찮다",
          ending: "close.ayo.plain",
          tense: "none",
        },
        gloss: "be okay",
      },
    ],
    hear: "ai-voice",
    status: "proposed",
  },
  "ph.bit-busy-today": {
    korean: "오늘 좀 바빠.",
    intents: [
      "I'm a bit busy today",
      "today's a busy one",
      "I'm kind of busy today",
    ],
    register: "반말",
    toWhom: "a friend",
    setting: "everyday · turning down a plan",
    mood: "statement",
    parts: [
      { kind: "word", written: "오늘", lemma: "오늘", gloss: "today" },
      { kind: "word", written: "좀", lemma: "좀", gloss: "a bit" },
      {
        kind: "built",
        reading: {
          dictionary: "바쁘다",
          ending: "close.a.plain",
          tense: "none",
        },
        gloss: "be busy",
      },
    ],
    hear: "ai-voice",
    status: "proposed",
  },
  "ph.did-you-eat": {
    korean: "밥 먹었어?",
    intents: ["did you eat", "have you eaten", "how are you doing"],
    register: "반말",
    toWhom: "a friend",
    setting: "everyday · greeting someone",
    mood: "question",
    parts: [
      { kind: "word", written: "밥", lemma: "밥", gloss: "a meal" },
      {
        kind: "built",
        reading: { dictionary: "먹다", ending: "close.a.plain", tense: "past" },
        gloss: "eat",
      },
    ],
    hear: "ai-voice",
    status: "proposed",
  },
  "ph.pricey-but-good": {
    korean: "비싸지만 맛있어요.",
    intents: [
      "it's pricey but it's good",
      "expensive, but tasty",
      "it costs a lot, but it's delicious",
    ],
    register: "해요",
    toWhom: "anyone",
    setting: "a meal · weighing a place",
    mood: "statement",
    parts: [
      {
        kind: "built",
        reading: {
          dictionary: "비싸다",
          ending: "conn.jiman.contrast",
          tense: "none",
        },
        gloss: "be expensive",
      },
      {
        kind: "built",
        reading: {
          dictionary: "맛있다",
          ending: "close.ayo.plain",
          tense: "none",
        },
        gloss: "be tasty",
      },
    ],
    hear: "ai-voice",
    status: "proposed",
  },
  "ph.going-to-eat": {
    korean: "밥 먹으러 가요.",
    intents: [
      "I'm going to eat",
      "I'm off to get food",
      "I'm heading out for a meal",
    ],
    register: "해요",
    toWhom: "anyone",
    setting: "everyday · heading out",
    mood: "statement",
    parts: [
      { kind: "word", written: "밥", lemma: "밥", gloss: "a meal" },
      {
        kind: "built",
        reading: {
          dictionary: "먹다",
          ending: "conn.reo.purpose",
          tense: "none",
        },
        gloss: "eat",
      },
      {
        kind: "built",
        reading: {
          dictionary: "가다",
          ending: "close.ayo.plain",
          tense: "none",
        },
        gloss: "go",
      },
    ],
    hear: "ai-voice",
    status: "proposed",
  },
  "ph.will-it-rain-tomorrow": {
    korean: "내일 비가 올까?",
    intents: [
      "will it rain tomorrow",
      "I wonder if it'll rain tomorrow",
      "is it going to rain tomorrow",
    ],
    register: "반말",
    toWhom: "yourself",
    setting: "everyday · the weather",
    mood: "question",
    parts: [
      { kind: "word", written: "내일", lemma: "내일", gloss: "tomorrow" },
      { kind: "word", written: "비가", lemma: "비", gloss: "rain" },
      {
        kind: "built",
        reading: {
          dictionary: "오다",
          ending: "close.lkka.proposing",
          tense: "none",
        },
        gloss: "come (rain falls)",
      },
    ],
    hear: "ai-voice",
    status: "proposed",
  },
  "ph.i-didnt-know": {
    korean: "몰랐어요.",
    intents: ["I didn't know", "I had no idea", "I wasn't aware"],
    register: "해요",
    toWhom: "anyone",
    setting: "everyday · hearing news",
    mood: "statement",
    parts: [
      {
        kind: "built",
        reading: {
          dictionary: "모르다",
          ending: "close.ayo.plain",
          tense: "past",
        },
        gloss: "not know",
      },
    ],
    hear: "ai-voice",
    status: "proposed",
  },
} as const satisfies Record<PhraseId, Phrase>
