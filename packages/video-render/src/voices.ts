/**
 * Which Kokoro voice says each line of a video essay (#3321, C840): one
 * policy for every kind, the weekly call, the cards essays and their spoken
 * cards, the Rust and the interview essays and their openings.
 *
 * The owner (2026-11-21, close paraphrase): one synthetic voice all the way
 * through is monotone; a voice change is welcome at a chapter or context
 * change, and only there, since a change at random throws the listener; in
 * an exchange the asking and answering voices stay put; and the owner never
 * picks them. So the policy is one of two cases (`VoicePolicy`):
 *
 * - `fixed`: each speaker has one voice for the whole video. It is what every
 *   version pinned before the lanes says, kept byte for byte, so a published
 *   essay renders the same takes; and it is the weekly call's, whose
 *   sections already each have a voice of their own (`CALL_VOICES`).
 * - `lanes`: each speaker plays a role (`VoiceRole`), each role has its own
 *   lane of voices (`VOICE_LANES`), and the role's voice in chapter `c` is its
 *   lane's `c`th, round robin. A template version or a series turns it on by
 *   naming the lanes in its `voices` field (`VoicesIdSchema`), as the cast
 *   is turned on (C822), so a version already pinned never changes voice.
 *
 * What a chapter is, each kind says by which of its lines opens one
 * (`chapterVoices`): a chapter slide in an essay, a chapter mark in a cards
 * essay. The lanes are disjoint, so two roles never share a voice, the
 * asker and the answerer of an exchange included, and each lane holds at
 * least two voices, so a role's voice changes at every chapter boundary.
 *
 * Every name is one home's speaker loads (paulgsc/server
 * `infra/kokoro/say.py`, from Kokoro-FastAPI v0.9.2's `voices/v1_0`).
 */

import { z } from "zod"

/**
 * The English voices of home's speaker, American (`a`) and British (`b`),
 * female (`f`) and male (`m`): Kokoro v1.0's, without the v0 copies and the
 * blends. A voice outside it is refused at compile time.
 */
export const KOKORO_VOICES = [
  "af_alloy",
  "af_aoede",
  "af_bella",
  "af_heart",
  "af_jessica",
  "af_kore",
  "af_nicole",
  "af_nova",
  "af_river",
  "af_sarah",
  "af_sky",
  "am_adam",
  "am_echo",
  "am_eric",
  "am_fenrir",
  "am_liam",
  "am_michael",
  "am_onyx",
  "am_puck",
  "am_santa",
  "bf_alice",
  "bf_emma",
  "bf_isabella",
  "bf_lily",
  "bm_daniel",
  "bm_fable",
  "bm_george",
  "bm_lewis",
] as const

export type KokoroVoice = (typeof KOKORO_VOICES)[number]

/**
 * The lanes a version names in its `voices` field. A new set of lanes is a
 * new id, so the voices a pinned version names never change.
 */
export const VoicesIdSchema = z.enum(["lanes-v1"])

export type VoicesId = z.infer<typeof VoicesIdSchema>

/**
 * What a synthetic speaker does in a video: opens and closes it (`host`),
 * teaches a card (`narrator`), teaches an essay (`tutor`), asks in an
 * exchange (`asker`), or answers in one (`answerer`).
 */
export const VOICE_ROLES = [
  "host",
  "narrator",
  "tutor",
  "asker",
  "answerer",
] as const

export type VoiceRole = (typeof VOICE_ROLES)[number]

/** A role's voices, in the order its chapters take them: two at least. */
export type Lane = readonly [KokoroVoice, KokoroVoice, ...Array<KokoroVoice>]

/**
 * Each role's lane, by the lanes' id. Disjoint, so no two roles share a
 * voice. Two keep the voice they had before the lanes where it is first
 * heard: the host's opens on the call's host (chapter 0, the intro), and a
 * cards essay's first card (chapter 1) is still narrated in af_heart. The
 * others' voices before the lanes are taken by these two, so their lanes
 * are new voices.
 */
export const VOICE_LANES: Readonly<
  Record<VoicesId, Readonly<Record<VoiceRole, Lane>>>
> = {
  "lanes-v1": {
    host: ["am_michael", "bm_george", "am_puck"],
    narrator: ["af_nicole", "af_heart", "bf_emma"],
    tutor: ["am_fenrir", "bm_fable", "am_onyx"],
    asker: ["af_bella", "af_aoede", "bf_isabella"],
    answerer: ["af_kore", "af_sarah", "bm_lewis"],
  },
}

/** Who says a kind's lines, and so in which voice. `S` is the kind's own speakers. */
export type VoicePolicy<S extends string> =
  | {
      readonly kind: "fixed"
      readonly voices: Readonly<Record<S, KokoroVoice>>
    }
  | {
      readonly kind: "lanes"
      readonly lanes: VoicesId
      readonly roles: Readonly<Record<S, VoiceRole>>
    }

/**
 * A kind's policy for a version: the lanes it names in `voices`, its
 * speakers playing `roles`; else its `fixed` voices.
 */
export const voicePolicyOf = <S extends string>(
  voices: VoicesId | undefined,
  fixed: Readonly<Record<S, KokoroVoice>>,
  roles: Readonly<Record<S, VoiceRole>>
): VoicePolicy<S> =>
  voices === undefined
    ? { kind: "fixed", voices: fixed }
    : { kind: "lanes", lanes: voices, roles }

/** `speaker`'s voice in chapter `chapter` (from 0) under `policy`. */
export function voiceOf<S extends string>(
  policy: VoicePolicy<S>,
  speaker: S,
  chapter: number
): KokoroVoice {
  if (policy.kind === "fixed") return policy.voices[speaker]
  const lane = VOICE_LANES[policy.lanes][policy.roles[speaker]]
  const at = Math.max(0, Math.trunc(chapter)) % lane.length
  return lane[at] ?? lane[0]
}

/**
 * Each item's chapter, from 0, in order: it counts up at each item that
 * opens one, but the first, which is chapter 0 either way.
 */
export function chapterIndexes(opens: ReadonlyArray<boolean>): Array<number> {
  let chapter = 0
  return opens.map((open, i) => {
    if (open && i > 0) chapter += 1
    return chapter
  })
}

/** A line as the policy reads it: who says it, and whether it opens a new chapter. */
export type VoicedLine<S extends string> = {
  readonly speaker: S
  readonly opens: boolean
}

/**
 * Each line's voice, in order: its speaker's in its chapter
 * (`chapterIndexes`), so every line of a chapter is said in its speaker's
 * voice for that chapter.
 */
export function chapterVoices<S extends string>(
  policy: VoicePolicy<S>,
  lines: ReadonlyArray<VoicedLine<S>>
): Array<KokoroVoice> {
  const chapters = chapterIndexes(lines.map((line) => line.opens))
  return lines.map((line, i) => voiceOf(policy, line.speaker, chapters[i] ?? 0))
}
