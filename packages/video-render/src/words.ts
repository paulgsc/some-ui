/**
 * Every word the phone shows for the renderer's choices: each vocabulary
 * value's name, and each plan's card, read off the plan's own rules so a
 * card can't say other than what the plan sets. Pure, and in the person's
 * terms (`__tests__/words.test.ts`).
 */

import { LOOK_RULES, VOICE_RULES } from "./plans"
import type { Look, LookRules, Voice, VoiceRules } from "./plans"
import type { MusicMode, Sound, Transition } from "./vocabulary"

export const TRANSITION_WORDS: Readonly<Record<Transition, string>> = {
  cut: "Cut",
  crossfade: "Crossfade",
  "dip-to-black": "Dip to black",
  "slide-up": "Slide up",
  wipe: "Wipe",
  zoom: "Zoom",
}

export const SOUND_WORDS: Readonly<Record<Sound, string>> = {
  whoosh: "Whoosh",
  click: "Click",
  pop: "Pop",
  thud: "Thud",
  riser: "Riser",
  ding: "Ding",
}

export const MUSIC_WORDS: Readonly<Record<MusicMode, string>> = {
  off: "Off",
  "under-voice": "Under your voice",
  "up-between-lines": "Up between lines",
}

const MOTION_WORDS: Readonly<Record<LookRules["motion"]["kind"], string>> = {
  still: "Still",
  "push-in": "Slow push in",
  "punch-in-at-taps": "Punch-in at taps",
}

const HEADLINE_WORDS: Readonly<Record<LookRules["headline"], string>> = {
  appears: "Appears",
  "fades-up": "Fades up",
  pops: "Pops",
}

const CAPTION_WORDS: Readonly<Record<LookRules["captions"], string>> = {
  line: "A line at a time",
  word: "Word by word",
}

const SHOWS_WORDS: Readonly<Record<VoiceRules["sceneShows"], string>> = {
  point: "The point, and facts to keep",
  line: "The line",
  either: "Either, labelled",
}

const CHECKS_WORDS: Readonly<Record<VoiceRules["checks"], string>> = {
  "true-and-yours": "It's true, and sounds like you",
  "every-word": "Every word is said",
  "per-scene": "Scene by scene",
}

const FROM_WORDS: Readonly<Record<VoiceRules["captionsFrom"], string>> = {
  said: "What you said",
  line: "The line",
}

/** One row of a plan's card: what it decides, and how. */
export type PlanRow = { readonly what: string; readonly how: string }

export type PlanWords = {
  readonly name: string
  readonly rows: ReadonlyArray<PlanRow>
}

const LOOK_NAMES: Readonly<Record<Look, string>> = {
  plain: "Plain",
  calm: "Calm",
  lively: "Lively",
}

const VOICE_NAMES: Readonly<Record<Voice, string>> = {
  "ad-lib": "Ad-lib",
  read: "Read",
  mixed: "Mixed",
}

function lookCard(look: Look): PlanWords {
  const r = LOOK_RULES[look]
  const cues = [r.cues.sceneStart, r.cues.tap].flatMap((s) =>
    s ? [SOUND_WORDS[s]] : []
  )
  return {
    name: LOOK_NAMES[look],
    rows: [
      { what: "Between scenes", how: TRANSITION_WORDS[r.transition] },
      { what: "Picture", how: MOTION_WORDS[r.motion.kind] },
      { what: "Headline", how: HEADLINE_WORDS[r.headline] },
      {
        what: "Sound cues",
        how: cues.length ? cues.join(", ") : "None",
      },
      { what: "Captions", how: CAPTION_WORDS[r.captions] },
      { what: "Music", how: MUSIC_WORDS[r.music] },
    ],
  }
}

function voiceCard(voice: Voice): PlanWords {
  const r = VOICE_RULES[voice]
  return {
    name: VOICE_NAMES[voice],
    rows: [
      { what: "Scene shows", how: SHOWS_WORDS[r.sceneShows] },
      { what: "Claude checks", how: CHECKS_WORDS[r.checks] },
      { what: "Rounds", how: `Up to ${r.rounds} a scene` },
      { what: "Captions from", how: FROM_WORDS[r.captionsFrom] },
    ],
  }
}

export const LOOK_WORDS: Readonly<Record<Look, PlanWords>> = {
  plain: lookCard("plain"),
  calm: lookCard("calm"),
  lively: lookCard("lively"),
}

export const VOICE_WORDS: Readonly<Record<Voice, PlanWords>> = {
  "ad-lib": voiceCard("ad-lib"),
  read: voiceCard("read"),
  mixed: voiceCard("mixed"),
}
