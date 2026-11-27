/**
 * Every word the takes needing attention say (HEARD3, #3075), in one pure
 * table, in the person's terms: what home couldn't make out of a take and
 * why, one way of saying it per code, and what each act keeps. Never the
 * machinery behind it. "Take" is the one word for a recording (ST34).
 * `__tests__/words.test.ts` holds both.
 */
import { counted } from "@some-ui/core-utils"
import type { TakeOf } from "@soundbites/lib/library/kinds"
import { dayAt } from "@soundbites/lib/library/words"

import type { ProblemCode } from "./codes"
import type { TakeSource } from "./source"

const takes = (n: number): string => counted(n, "take")

/** Languages home names, as the page says them; others by their code. */
const LANGUAGES: Readonly<Record<string, string>> = {
  en: "English",
  ko: "Korean",
  ja: "Japanese",
  zh: "Chinese",
  es: "Spanish",
  pt: "Portuguese",
  fr: "French",
  de: "German",
}

const languageName = (code: string): string =>
  LANGUAGES[code] ?? "another language"

/**
 * Each kind of take home keeps, by home's name for it, Studio's but one
 * (its takes name their own place); a kind added to `TAKE_OFS` fails to
 * compile here until it has words.
 */
const OF_WORDS = {
  "rust-round": "A Rust Rounds take",
  interview: "An interview take",
  reflection: "A spoken reflection",
  game: "A take from a game",
  leetype: "A LeetType take",
  lens: "A grammar lens take",
  scene: "A drama scene take",
  soundbite: "A soundbite take",
  jobs: "A Jobs take",
  hunch: "A take for the shop",
} as const satisfies Record<Exclude<TakeOf, "studio">, string>

const isNamed = (of: string): of is keyof typeof OF_WORDS =>
  Object.hasOwn(OF_WORDS, of)

export const RECONCILE_WORDS = {
  heading: "Needs your attention",
  /** What a pull down reads again, for "Couldn't check … just now". */
  pullWhat: "the takes home couldn't hear well",
  /** The way in, on Takes' first page, with how many wait. */
  wayIn: (count: number): string => `${takes(count)} home couldn't hear well`,
  wayInLine:
    "Hear each one, then keep it, record it again, ask home to try again, or delete it.",
  away: "Home can't be reached right now. Try again once you're back in reach.",
  busy: "This phone was busy with home just then. Try again in a moment.",
  older:
    "Home doesn't say yet which takes it couldn't hear well. Once it runs a newer version, they show here.",
  unreadable:
    "What home said couldn't be read on this phone. Try again in a moment.",
  none: "Every take home has heard came through. Nothing waits on you here.",
  /**
   * What the page holds, said once at its top: home may list fewer than
   * wait (its newest), and this phone may not show every one it lists.
   */
  shown: (listed: number, total: number): string =>
    listed < total
      ? `${String(listed)} of the ${takes(total)} home couldn't hear well show here, by what went wrong.`
      : `${takes(total)} home couldn't hear well, by what went wrong.`,
  /**
   * Home counts takes waiting that the list doesn't show: past its newest,
   * once those shown were settled, or of a kind this phone can't read yet.
   */
  noneShown: (total: number): string =>
    total === 1
      ? "1 take home couldn't hear well waits on home but doesn't show here."
      : `${String(total)} takes home couldn't hear well wait on home but don't show here.`,
  /** What one code means: its name, and a line under it. */
  codes: {
    low_confidence: {
      name: "Home wasn't sure of the words",
      line: "What home heard may not be what you said.",
    },
    repetitive: {
      name: "The words went round in a loop",
      line: "Home heard the same words over and over, which usually means it lost the thread.",
    },
    no_speech: {
      name: "Mostly quiet to home",
      line: "Home heard words, but thought much of the take was silence.",
    },
    off_language: {
      name: "Heard in another language",
      line: "Home heard a language other than the one this take is said in.",
    },
    sparse: {
      name: "Too few words for the time",
      line: "Home heard far fewer words than a take this long should hold.",
    },
    garbled: {
      name: "Home couldn't make it out",
      line: "Home heard something, but couldn't tell what was said.",
    },
    nothing_said: {
      name: "Nothing said, to home",
      line: "Home heard no words in this take at all.",
    },
    unreadable: {
      name: "Home couldn't open the sound",
      line: "The take's sound couldn't be read, so home never heard it.",
    },
    too_long: {
      name: "Too long for home to hear",
      line: "The take runs longer than home hears in one go.",
    },
    deadline: {
      name: "Home ran out of time",
      line: "Home stopped hearing it before it finished.",
    },
    engine: {
      name: "Home's hearing stopped",
      line: "Something on home stopped partway through hearing it.",
    },
    failed: {
      name: "Home couldn't hear it",
      line: "Home tried and never heard this take.",
    },
  } satisfies Record<
    ProblemCode,
    { readonly name: string; readonly line: string }
  >,
  /** The language home heard, beside what the take is said in. */
  heardAs: (heard: string, expected: string | null): string =>
    expected === null
      ? `Heard as ${languageName(heard)}.`
      : `Heard as ${languageName(heard)}, said in ${languageName(expected)}.`,
  /** What home heard, said before its words. */
  heardLabel: "What home heard",
  heardNothing: "Home heard no words.",
  neverHeard: "Home never heard it.",
  said: (recordedAt: string): string => `Said ${dayAt(recordedAt)}`,
  /**
   * What kind of take it is, by home's name for its kind; a Studio take is
   * named by what it was for (`LIBRARY_WORDS.kinds`) instead.
   */
  of: (of: string): string => (isNamed(of) ? OF_WORDS[of] : "A take"),
  /** What a row of chips does, for a reader that can't see it. */
  chips: "Show only the takes where",
  /** The acts, and what each keeps. */
  acts: {
    keep: "Keep it",
    again: "Record it again",
    delete: "Delete…",
  },
  actsLabel: "What to do with this take",
  /** The way back to what a take was said for, to say it again (#3339). */
  source: {
    spoken: "Go back to its spoken card, to record it again",
    question: "Go to its question, to say it again",
    read: "Go to its card, to read it aloud again",
  } satisfies Record<TakeSource["kind"], string>,
  keptForGood:
    "Home keeps this kind of take for good, so it can't be deleted here.",
  /** Said once an act is kept on home, as the take leaves the list. */
  done: {
    keep: "Kept as it is. It leaves this list; home keeps what it made of it.",
    again:
      "Marked to record again. It leaves this list; home keeps this take too.",
  },
  acting: "Telling home…",
  /** Home had nothing left to settle on a take: it leaves the list. */
  settled:
    "Home has nothing left to settle on that take, so it leaves this list.",
  /** An act home didn't take: nothing changed, and the take stays. */
  notTaken: "Home didn't take that just now, so nothing changed. Try again.",
  /** An act home wasn't told of: this phone stayed busy with home. */
  phoneBusy:
    "This phone was busy with home just then, so nothing changed. Try again in a moment.",
} as const
