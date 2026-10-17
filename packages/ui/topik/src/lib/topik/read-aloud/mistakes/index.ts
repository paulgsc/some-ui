/**
 * The mistake catalogue (adaptive-learning canon Def. 4.9): mistakes learners
 * are known to make, each with a stable identifier, a one-line rule, and
 * where the mistake comes from. A deck's misform names one by identifier
 * (`read-aloud/content`), and a misform naming one that is not here is
 * dropped at load. An identifier is identity (Def. 1.3): never renamed, and
 * never reused for another mistake.
 */

export type Mistake = {
  /** What the summary calls it. */
  name: string
  /** The rule the grammar lens shows at the reveal. */
  rule: string
  /** Where the mistake comes from: why a learner writes it. */
  from: string
}

export const MISTAKES = {
  "e-for-eseo": {
    name: "에 where 에서 belongs",
    rule: "에서 marks where an action happens; 에 marks where you go, or where something is.",
    from: "Both mark a place, and English says “at” for both.",
  },
  "eseo-for-e": {
    name: "에서 where 에 belongs",
    rule: "With 가다, 오다 and 있다 the place takes 에; with 가다 and 오다, 에서 marks where you set off from.",
    from: "The 에/에서 slip in reverse, once actions are known to take 에서.",
  },
  "eseo-after-time": {
    name: "에서 after a time",
    rule: "A clock time, a weekday or a part of the day takes 에 (일곱 시에, 월요일에, 아침에); 오늘, 어제 and 내일 take none.",
    from: "에서 taken as the general “at”.",
  },
  "object-for-subject": {
    name: "을/를 with 좋다, 있다, 없다, 필요하다",
    rule: "좋다, 있다, 없다 and 필요하다 take 이/가 on the thing: 커피가 좋아요, 시간이 없어요.",
    from: "English makes the thing an object.",
  },
  "tense-mismatch": {
    name: "Tense that ignores the question",
    rule: "The answer’s tense follows the question’s: 어제 뭐 했어요? is answered in the past.",
    from: "The present form, learned first, used for every answer.",
  },
  "progressive-now": {
    name: "-고 있어요 for a moment in the past",
    rule: "Something in progress at a past moment is -고 있었어요; -고 있어요 is going on now.",
    from: "The progressive learned in the present only.",
  },
  "b-irregular": {
    name: "ㅂ-irregular conjugated as regular",
    rule: "덥다, 춥다, 맵다, 어렵다: before a vowel ending, ㅂ becomes 우: 더워요, 추워요.",
    from: "The regular -어요 rule applied to an ㅂ-irregular stem.",
  },
  "d-irregular": {
    name: "ㄷ-irregular conjugated as regular",
    rule: "듣다, 걷다: before a vowel ending, ㄷ becomes ㄹ: 들어요, 걸어요.",
    from: "The regular -어요 rule applied to a ㄷ-irregular stem.",
  },
  "reu-irregular": {
    name: "르-irregular conjugated as regular",
    rule: "모르다, 다르다, 빠르다: 르 doubles its ㄹ before -아요/-어요: 몰라요, 달라요.",
    from: "The regular -어요 rule applied to a 르-irregular stem.",
  },
  "eu-kept": {
    name: "으 kept before -아요/-어요",
    rule: "바쁘다, 아프다, 크다: 으 drops before -아요/-어요: 바빠요, 아파요, 커요.",
    from: "The stem kept whole, as a consonant stem is.",
  },
  "vowel-harmony": {
    name: "-아요 and -어요 swapped",
    rule: "-아요 follows a stem whose last vowel is ㅏ or ㅗ, -어요 any other: 앉아요, 먹어요.",
    from: "The ending chosen by ear rather than by the stem’s last vowel.",
  },
  "honorific-self": {
    name: "-(으)세요 about yourself",
    rule: "-(으)시- honours someone else; about yourself the form without it is used: 저는 학생이에요.",
    from: "-세요 learned as simply the polite ending.",
  },
} as const satisfies Record<string, Mistake>

export type MistakeId = keyof typeof MISTAKES

export const isMistakeId = (value: string): value is MistakeId =>
  Object.hasOwn(MISTAKES, value)
