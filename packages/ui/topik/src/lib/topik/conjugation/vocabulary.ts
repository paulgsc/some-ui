/**
 * The vocabulary list conjugation reads (KPLAY's KP2, #2851): each verb and
 * adjective by its dictionary form, with what spelling can't reveal: which
 * kind of stem it is, and which irregular class it falls in (춥다 is
 * ㅂ-irregular, 입다 is not; 듣다 is ㄷ-irregular, 받다 is not).
 *
 * Owned data: conjugation follows the flag here, and `@dongsa/conjugation`'s
 * own judgment is held to agree with it by this module's test, so a word the
 * library classes differently is found rather than conjugated two ways.
 * The copula 이다 is not listed: a noun with 이다 is outside the library's
 * scope, and outside this slice.
 */

/**
 * The classes whose stem changes before some endings. 으 and ㄹ change by
 * rule (바빠요, 사는 동안); the others by word.
 */
export type IrregularClass = "ㅂ" | "ㄷ" | "르" | "으" | "ㅅ" | "ㅎ" | "ㄹ"

export type Predicate = {
  class: "verb" | "adjective" | "existence"
  irregular: IrregularClass | null
  /** A verb of going or coming, which -(으)러 must be followed by. */
  movement?: true
}

export const VOCABULARY = {
  가다: { class: "verb", irregular: null, movement: true },
  오다: { class: "verb", irregular: null, movement: true },
  다니다: { class: "verb", irregular: null, movement: true },
  나가다: { class: "verb", irregular: null, movement: true },
  들어가다: { class: "verb", irregular: null, movement: true },
  보다: { class: "verb", irregular: null },
  먹다: { class: "verb", irregular: null },
  마시다: { class: "verb", irregular: null },
  사다: { class: "verb", irregular: null },
  자다: { class: "verb", irregular: null },
  앉다: { class: "verb", irregular: null },
  읽다: { class: "verb", irregular: null },
  배우다: { class: "verb", irregular: null },
  기다리다: { class: "verb", irregular: null },
  놓치다: { class: "verb", irregular: null },
  지키다: { class: "verb", irregular: null },
  하다: { class: "verb", irregular: null },
  공부하다: { class: "verb", irregular: null },
  도착하다: { class: "verb", irregular: null },
  받다: { class: "verb", irregular: null },
  닫다: { class: "verb", irregular: null },
  입다: { class: "verb", irregular: null },
  잡다: { class: "verb", irregular: null },
  씻다: { class: "verb", irregular: null },
  웃다: { class: "verb", irregular: null },
  좋다: { class: "adjective", irregular: null },
  많다: { class: "adjective", irregular: null },
  괜찮다: { class: "adjective", irregular: null },
  비싸다: { class: "adjective", irregular: null },
  춥다: { class: "adjective", irregular: "ㅂ" },
  덥다: { class: "adjective", irregular: "ㅂ" },
  맵다: { class: "adjective", irregular: "ㅂ" },
  어렵다: { class: "adjective", irregular: "ㅂ" },
  쉽다: { class: "adjective", irregular: "ㅂ" },
  듣다: { class: "verb", irregular: "ㄷ" },
  걷다: { class: "verb", irregular: "ㄷ" },
  모르다: { class: "verb", irregular: "르" },
  부르다: { class: "verb", irregular: "르" },
  다르다: { class: "adjective", irregular: "르" },
  빠르다: { class: "adjective", irregular: "르" },
  바쁘다: { class: "adjective", irregular: "으" },
  아프다: { class: "adjective", irregular: "으" },
  크다: { class: "adjective", irregular: "으" },
  쓰다: { class: "verb", irregular: "으" },
  낫다: { class: "verb", irregular: "ㅅ" },
  짓다: { class: "verb", irregular: "ㅅ" },
  그렇다: { class: "adjective", irregular: "ㅎ" },
  빨갛다: { class: "adjective", irregular: "ㅎ" },
  살다: { class: "verb", irregular: "ㄹ" },
  놀다: { class: "verb", irregular: "ㄹ" },
  만들다: { class: "verb", irregular: "ㄹ" },
  알다: { class: "verb", irregular: "ㄹ" },
  울다: { class: "verb", irregular: "ㄹ" },
  길다: { class: "adjective", irregular: "ㄹ" },
  멀다: { class: "adjective", irregular: "ㄹ" },
  있다: { class: "existence", irregular: null },
  없다: { class: "existence", irregular: null },
  맛있다: { class: "existence", irregular: null },
  재미없다: { class: "existence", irregular: null },
} as const satisfies Record<string, Predicate>

export type Dictionary = keyof typeof VOCABULARY

export const isListed = (value: string): value is Dictionary =>
  Object.hasOwn(VOCABULARY, value)
