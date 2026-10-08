/**
 * The webtoon's feeling vocabulary: the one closed set the drama has
 * (docs/makjang/README.md, "The webtoon: one feeling per scene").
 *
 * Every scene names one of these keys, and a tree that names any other is
 * rejected at load (`core/tree-audit`), so no scene renders without its
 * anchor. It is a palette, not a catalogue: a feeling says how a scene may
 * look and sound, never what happens in it.
 *
 * Topik owns the words - the caption, the cry and the lettering, fixed per
 * feeling and never generated, so the anchor is identical wherever it
 * recurs. The points, hues, textures and motions are presentation and move to
 * `@some-ui/styles` with the renderer (MKJ-S2), which then owns the key type;
 * until then the keys live here with their words.
 */

export const FEELING_KEYS = [
  "tension",
  "rivalry",
  "chill",
  "cringe",
  "fury",
  "twist",
  "flutter",
  "warmth",
] as const

export type FeelingKey = (typeof FEELING_KEYS)[number]

export type FeelingWords = {
  /** The feeling's Korean name. */
  name: string
  /** What it is, in English, for the tree prompt's author. */
  meaning: string
  /** The variety-show caption (예능 자막) on the scene's cover. */
  caption: string
  /** The voiced cry, heard after the tone when sound is on. */
  cry: string
  /** The sound-effect lettering. */
  lettering: string
}

export const FEELING_WORDS: Readonly<Record<FeelingKey, FeelingWords>> = {
  tension: {
    name: "긴장",
    meaning:
      "tension: everyone is holding their breath, something could go wrong",
    caption: "숨 막히는 긴장감",
    cry: "흠…",
    lettering: "꿀꺽",
  },
  rivalry: {
    name: "기싸움",
    meaning: "a war of nerves: polite on the surface, a contest underneath",
    caption: "기싸움 시작",
    cry: "호오?",
    lettering: "파직",
  },
  chill: {
    name: "싸늘",
    meaning: "a chill: the room goes cold, someone is shut out",
    caption: "갑분싸",
    cry: "헐.",
    lettering: "휘잉",
  },
  cringe: {
    name: "민망",
    meaning: "embarrassment: a gaffe, sweat, wanting the floor to open",
    caption: "동공지진",
    cry: "아이고…",
    lettering: "삐질",
  },
  fury: {
    name: "분노",
    meaning: "fury: an explosion, a slammed door, thrown water",
    caption: "분노 폭발",
    cry: "허, 참!",
    lettering: "쾅",
  },
  twist: {
    name: "반전",
    meaning: "a twist: a reveal that turns the scene over",
    caption: "충격 반전",
    cry: "헉!",
    lettering: "두둥",
  },
  flutter: {
    name: "설렘",
    meaning: "a flutter: romance, a heart skipping a beat",
    caption: "심쿵",
    cry: "어머나~",
    lettering: "두근",
  },
  warmth: {
    name: "훈훈",
    meaning: "warmth: relief, a reconciliation, things settle well",
    caption: "훈훈한 마무리",
    cry: "휴, 다행이다.",
    lettering: "휴",
  },
}

const KEYS: ReadonlySet<string> = new Set(FEELING_KEYS)

export const isFeelingKey = (value: string): value is FeelingKey =>
  KEYS.has(value)
