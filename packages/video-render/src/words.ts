/**
 * Every word a plan's card shows on the phone (Shape): each plan's name and
 * the rows that say what it sets. Pure, and the one place those words live,
 * so they stay in the person's terms: what the video does, never the
 * renderer's names for it (`__tests__/words.test.ts`).
 */

import type { Look, Voice } from "./plans"

/** One row of a plan's card: what it decides, and how. */
export type PlanRow = { readonly what: string; readonly how: string }

export type PlanWords = {
  readonly name: string
  readonly rows: ReadonlyArray<PlanRow>
}

export const LOOK_WORDS: Readonly<Record<Look, PlanWords>> = {
  plain: {
    name: "Plain",
    rows: [
      { what: "Between scenes", how: "Cut" },
      { what: "Picture", how: "Still" },
      { what: "Headline", how: "Appears" },
      { what: "Sound cues", how: "None" },
      { what: "Captions", how: "A line at a time" },
      { what: "Music", how: "Off" },
    ],
  },
  calm: {
    name: "Calm",
    rows: [
      { what: "Between scenes", how: "Crossfade" },
      { what: "Picture", how: "Slow push in" },
      { what: "Headline", how: "Fades up" },
      { what: "Sound cues", how: "None" },
      { what: "Captions", how: "Word by word" },
      { what: "Music", how: "Under your voice" },
    ],
  },
  lively: {
    name: "Lively",
    rows: [
      { what: "Between scenes", how: "Slide up" },
      { what: "Picture", how: "Punch-in at taps" },
      { what: "Headline", how: "Pops" },
      { what: "Sound cues", how: "Whoosh, click" },
      { what: "Captions", how: "Word by word" },
      { what: "Music", how: "Up between lines" },
    ],
  },
}

export const VOICE_WORDS: Readonly<Record<Voice, PlanWords>> = {
  "ad-lib": {
    name: "Ad-lib",
    rows: [
      { what: "Scene shows", how: "The point, and facts to keep" },
      { what: "Claude checks", how: "It's true, and sounds like you" },
      { what: "Rounds", how: "Up to 3 a scene" },
      { what: "Captions from", how: "What you said" },
    ],
  },
  read: {
    name: "Read",
    rows: [
      { what: "Scene shows", how: "The line" },
      { what: "Claude checks", how: "Every word is said" },
      { what: "Rounds", how: "Up to 3 a scene" },
      { what: "Captions from", how: "The line" },
    ],
  },
  mixed: {
    name: "Mixed",
    rows: [
      { what: "Scene shows", how: "Either, labelled" },
      { what: "Claude checks", how: "Scene by scene" },
      { what: "Rounds", how: "Up to 3 a scene" },
      { what: "Captions from", how: "What you said" },
    ],
  },
}
