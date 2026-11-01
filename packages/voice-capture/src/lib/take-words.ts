/**
 * The take pattern's words: one pure table, in the person's
 * terms (CLAUDE.md, "State in the person's terms"). It says what is kept
 * where and what a control does, never the machinery: no state name, no
 * "supersede", no "set-aside" as the code spells it. A screen adds its
 * item's words around the parts (what the take answers), never its own
 * "Too short" or "Kept": those are `ended`, the shared `TAKE_ENDING_WORDS`.
 */
import { assertNever, formatTimecode } from "@some-ui/core-utils"

import type { TakeEndingWords } from "./take-kit"
import { TAKE_ENDING_WORDS, takeEndingSaid } from "./take-kit"
import type { TakeKept, TakePlace } from "./take-pattern"
import type { TakeButtonView, TakeSaid } from "./take-view"

export type TakeWords = {
  /** What the take button shows, by what a tap does now. */
  readonly button: {
    readonly ready: string
    readonly again: string
    readonly opening: string
    readonly recording: string
    readonly keeping: string
    readonly elsewhere: string
    readonly full: (max: number) => string
  }
  /** What a tap on the take button does, for a screen reader. */
  readonly buttonLabel: {
    readonly ready: string
    readonly again: string
    readonly opening: string
    readonly recording: string
    readonly keeping: string
    readonly elsewhere: string
    readonly full: string
  }
  /** "0:12 / 1:00": how long it has run, against the cap. */
  readonly elapsed: (elapsedMs: number, capMs: number) => string
  /** "0:48 left": the time left before the cap, for `clock: "left"`. */
  readonly left: (leftMs: number) => string
  /** The last stretch before the cap. */
  readonly nearlyUp: (leftMs: number) => string
  /** A take's length. */
  readonly length: (ms: number) => string
  /**
   * Where a take is kept (MIC3), as its store read it from what home told
   * this phone: `keptSaid` picks one.
   */
  readonly place: {
    readonly phone: string
    readonly going: string
    /** On home, when this phone didn't note since when. */
    readonly home: string
    readonly homeSince: (when: string) => string
    /** On this phone, waiting for the screen to send its item (`on-confirm`). */
    readonly unsent: string
  }
  /** A moment, as `place.homeSince` says it: its day and time. */
  readonly when: (iso: string) => string
  readonly play: string
  readonly stop: string
  readonly redo: string
  readonly letGo: string
  /**
   * Let go of a take that never left this phone (`send: "on-confirm"`),
   * which deletes it for good, and what is said once it has.
   */
  readonly discard: string
  readonly discarded: string
  /** For a screen reader: which take a row's control acts on. */
  readonly rowLabel: (action: string, lengthMs: number) => string
  /** The superseded takes, collapsed (D2). */
  readonly earlier: (count: number) => string
  /** Said once a take is set aside (D3), by where it is kept. */
  readonly setAside: Readonly<Record<TakePlace, string>>
  readonly unplayable: string
  /** Every way a take ends. */
  readonly ended: TakeEndingWords
}

export const TAKE_WORDS: TakeWords = {
  button: {
    ready: "Tap to talk",
    again: "Tap to record again",
    opening: "Opening the microphone…",
    recording: "Tap to stop",
    keeping: "Keeping it…",
    elsewhere: "Another take is recording",
    full: (max) => `${max} kept. Redo one or let one go to record another.`,
  },
  buttonLabel: {
    ready: "Start talking",
    again: "Record it again",
    opening: "Opening the microphone. Tap to stop",
    recording: "Stop, and keep it",
    keeping: "Keeping it",
    elsewhere: "Another take is recording",
    full: "No room for another take",
  },
  elapsed: (elapsedMs, capMs) =>
    `${formatTimecode(elapsedMs)} / ${formatTimecode(capMs)}`,
  // Rounded up, so it reads 0:00 only once the take has stopped.
  left: (leftMs) =>
    `${formatTimecode(Math.max(0, Math.ceil(leftMs / 1_000)) * 1_000)} left`,
  nearlyUp: (leftMs) => {
    const seconds = Math.max(0, Math.ceil(leftMs / 1_000))
    return `${seconds} second${seconds === 1 ? "" : "s"} left`
  },
  length: (ms) => formatTimecode(ms),
  place: {
    phone: "Kept on this phone",
    going: "On this phone, going home",
    home: "On home",
    homeSince: (when) => `On home since ${when}`,
    unsent: "On this phone. Nothing has been sent",
  },
  when: (iso) =>
    new Date(iso).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }),
  play: "Play",
  stop: "Stop",
  redo: "Redo",
  letGo: "Let it go",
  discard: "Delete",
  discarded: "Deleted. Nothing was sent.",
  rowLabel: (action, lengthMs) =>
    `${action} the take of ${formatTimecode(lengthMs)}`,
  earlier: (count) => `Earlier take${count === 1 ? "" : "s"} (${count})`,
  setAside: {
    phone: "Set aside. It stays on this phone.",
    going: "Set aside. It stays on this phone until home has it.",
    home: "Set aside. Home keeps it.",
  },
  unplayable: "Couldn't play that take.",
  // The pattern's row offers Redo beside the take, so it says so.
  ended: {
    ...TAKE_ENDING_WORDS,
    unheard: "Kept, but I didn't hear you. Redo it to say it again.",
  },
}

/** What the take button shows. */
export function buttonSaid(words: TakeWords, view: TakeButtonView): string {
  switch (view.kind) {
    case "ready": {
      return view.again ? words.button.again : words.button.ready
    }
    case "recording": {
      return words.button.recording
    }
    case "full": {
      return words.button.full(view.max)
    }
    case "opening":
    case "keeping":
    case "elsewhere": {
      return words.button[view.kind]
    }
    default: {
      return assertNever(view)
    }
  }
}

/** What a tap on the take button does, for a screen reader. */
export function buttonLabel(words: TakeWords, view: TakeButtonView): string {
  if (view.kind === "ready") {
    return view.again ? words.buttonLabel.again : words.buttonLabel.ready
  }
  return words.buttonLabel[view.kind]
}

/** Where a take is kept, and since when. */
export function keptSaid(words: TakeWords, kept: TakeKept): string {
  switch (kept.place) {
    case "phone":
    case "going": {
      return words.place[kept.place]
    }
    case "home": {
      return kept.since === null
        ? words.place.home
        : words.place.homeSince(words.when(kept.since))
    }
    default: {
      return assertNever(kept)
    }
  }
}

/** The line said beside the button. */
export function takeSaid(words: TakeWords, said: TakeSaid): string {
  switch (said.kind) {
    case "ended": {
      return takeEndingSaid(words.ended, said.ended)
    }
    case "setAside": {
      return words.setAside[said.place]
    }
    case "unplayable": {
      return words.unplayable
    }
    default: {
      return assertNever(said)
    }
  }
}
