/**
 * Every word the phone says about being signed in to home (SIGNIN1, #3087):
 * the sign-in mark on every screen, its sheet, the notice when home stops
 * knowing the phone, and Settings › Home's first line. Pure, and the one
 * place those words live, so they say what is kept where and since when,
 * never the machinery (`__tests__/sign-in-words.test.ts`).
 *
 * On the phone "signed in" means paired with home and known there: the
 * phone's own record needs no sign-in, and pairing is how it signs in to
 * home (docs/calls/C470.json).
 */
import { assertNever } from "@some-ui/core-utils"

import { hostOf } from "./address"
import type { HomeLinkState, PairFailure, UnpairedNote } from "./model"
import { lookedAt } from "./words"

/** Which of the mark's looks the phone is in. */
export type SignedIn =
  /** The phone's record is being read. */
  | "reading"
  /** Paired, and home hasn't said otherwise. */
  | "in"
  /** Paired, and home isn't answering just now. */
  | "away"
  /** Not paired. */
  | "out"
  /** Paired, and home stopped knowing the phone. */
  | "lost"

export type SignInView = {
  readonly signedIn: SignedIn
  /** The mark's spoken name, with how it stands. */
  readonly label: string
  /** The sheet's first line, and Settings › Home's. */
  readonly line: string
  /** What the sheet says under it, a sentence each. */
  readonly notes: ReadonlyArray<string>
  /** The sheet's one way on, to Settings › Home. */
  readonly action: string
}

/** A day the phone paired: its date. */
const pairedOn = (t: number): string =>
  new Date(t).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })

/** Why the phone is not paired, said once (Settings › Home and the sheet). */
export const UNPAIRED_NOTES: Readonly<Record<UnpairedNote, string>> = {
  unpaired: "Unpaired.",
  "unpaired-offline":
    "Unpaired on this phone. Home couldn't be reached, so it still holds this phone's key until it expires: sign out everywhere on your computer to end it now.",
  lost: "This phone's pairing didn't survive a restore. Pair again; to end the old one, sign out everywhere on your computer.",
  unreadable:
    "This phone couldn't read its pairing just now. Restart the app to try again. Pairing again replaces it; to end the old one, sign out everywhere on your computer.",
}

export const SIGN_IN = {
  /** The sheet's title, the same in every look. */
  title: "This phone and home",
  /** What being signed in is, said in every look's sheet. */
  what: "Home is your own computer at home. While this phone is signed in there, what you keep here goes there too, whenever the app is open on your home network.",
  pair: "Pair with home",
  pairAgain: "Pair again",
  settings: "Home settings",
  /** The notice when home doesn't know the phone. */
  lostNotice:
    "Home doesn't know this phone any more. What you do stays here until you pair again.",
} as const

/** The day the phone paired, as a clause, or nothing for a pairing kept before it was kept. */
const since = (at: number | null, day: (t: number) => string): string =>
  at === null ? "" : `, since ${day(at)}`

/** What the phone says of being signed in to home, from the link's state. */
export function signInView(
  state: HomeLinkState,
  when: { day: (t: number) => string; moment: (t: number) => string } = {
    day: pairedOn,
    moment: lookedAt,
  }
): SignInView {
  const { link } = state
  switch (link.kind) {
    case "reading": {
      return {
        signedIn: "reading",
        label: "Home: looking",
        line: "Looking for this phone's pairing.",
        notes: [],
        action: SIGN_IN.settings,
      }
    }
    case "unpaired": {
      return {
        signedIn: "out",
        label: "Home: not signed in",
        line: "Not signed in to home.",
        notes: [
          ...(link.note === null ? [] : [UNPAIRED_NOTES[link.note]]),
          "What you do stays on this phone.",
          SIGN_IN.what,
        ],
        action: SIGN_IN.pair,
      }
    }
    case "paired": {
      const host = hostOf(link.base)
      const signedIn = `Signed in to home at ${host}${since(link.since, when.day)}.`
      const { standing } = link
      if (standing.kind === "forgotten") {
        return {
          signedIn: "lost",
          label: "Home: no longer signed in",
          line: `Home didn't know this phone when the phone last asked, on ${when.moment(standing.at)}.`,
          notes: [
            "What you do stays on this phone until you pair it again. Nothing on the phone or on home was deleted.",
            "Home forgets a phone when you sign out everywhere, or when it hasn't heard from the phone for a long while. If home's sign-in was only off for a while, this clears the next time this phone sends something home.",
          ],
          action: SIGN_IN.pairAgain,
        }
      }
      if (state.away !== null) {
        return {
          signedIn: "away",
          label: "Home: signed in, not answering",
          line: signedIn,
          notes: [
            "Home isn't answering right now, so what you do waits on this phone and goes once home answers.",
            SIGN_IN.what,
          ],
          action: SIGN_IN.settings,
        }
      }
      return {
        signedIn: "in",
        label: "Home: signed in",
        line: signedIn,
        notes: [SIGN_IN.what],
        action: SIGN_IN.settings,
      }
    }
    default: {
      return assertNever(link)
    }
  }
}

/** The mark's tone in each look: muted, settled, or asking to be looked at. */
export const TONE_OF: Readonly<Record<SignedIn, "quiet" | "ok" | "warn">> = {
  reading: "quiet",
  out: "quiet",
  in: "ok",
  away: "warn",
  lost: "warn",
}

/** What a pairing that didn't take says, with the host it was tried at. */
export function pairFailureLine(failure: PairFailure, host: string): string {
  switch (failure) {
    case "unreachable": {
      return `Couldn't reach ${host}. Are you on the home network?`
    }
    case "untrusted": {
      return `This phone doesn't trust ${host}'s certificate. Nothing was sent.`
    }
    case "bad-code": {
      return "That code didn't work. Codes work once, for 10 minutes. Get a new one on your computer."
    }
    case "too-many": {
      return "Too many tries. Wait a minute and try again."
    }
    case "not-set-up": {
      return `${host} can't pair phones: passkey sign-in isn't set up there.`
    }
    case "not-home": {
      return `${host} doesn't answer as home. Check the address your computer shows.`
    }
    case "not-kept": {
      return "This phone couldn't keep the pairing. Get a new code and try again."
    }
    case "other": {
      return "Pairing failed. Get a new code and try again."
    }
    default: {
      return assertNever(failure)
    }
  }
}

/** The pairing form's words, in Settings › Home and in the welcome. */
export const PAIR_FORM = {
  address: "Home's address",
  addressHint: "The address your computer shows beside the code.",
  homeAt: (host: string): string => `Home at ${host}`,
  notHttps:
    "Pairing needs a secure address: type the one your computer shows, as it shows it.",
  code: "Code from your computer",
  name: "Name this phone (optional)",
  nameHint: "Only you see it, in home's list of phones.",
  nameRefused:
    "A name can be up to 40 characters, with no hidden or line-breaking characters.",
  pair: "Pair",
  pairWith: (host: string): string => `Pair with ${host}`,
  pairing: "Pairing...",
  cancel: "Cancel",
  sends: "Sends only this code.",
  sendsWithName: "Sends only this code and the name you typed.",
} as const

/**
 * The first run's welcome on a phone not paired with home (SIGNIN2, #3088):
 * what home is, where the code comes from, and that saying no keeps
 * everything here.
 */
export const WELCOME = {
  title: "Pair this phone with home",
  lead: "Home is your own computer at home. Paired, this phone keeps a copy of what you do there, whenever the app is open on your home network.",
  restored:
    "A pairing stays with the phone it was made on, and doesn't come back from a backup, so this phone needs pairing again.",
  steps: [
    "On your computer, open Settings, then Account, then Phones, and choose Pair a phone.",
    "Type the address and the code it shows here.",
  ],
  notNow: "Not now",
  notNowNote:
    "Everything stays on this phone. You can pair any time from the mark at the top of the screen, or Settings, Home.",
} as const
