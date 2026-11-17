/**
 * What the lan web's phone list says (SIGNIN7, #3095), in the person's
 * terms: each phone by the name its owner gave it, when it paired, and when
 * it was last used at the latest it can be known (C493: home keeps when its
 * sign-in last renewed, so the phone was used then, and maybe since). A
 * name is the owner's own text, shown as typed. `./__tests__/words.test.ts`
 * holds that no line names the machinery.
 */
import { assertNever, dayOf, formatDay } from "@some-ui/core-utils"

import type { Phone, Said } from "./model"

/** A phone by its name, or as unnamed. */
export const phoneName = (phone: Pick<Phone, "name">): string =>
  phone.name ?? PHONES.unnamed

/** Said for a phone that may have no name: the name, or "the phone". */
const thePhone = (name: string | null): string => name ?? "The phone"

export const PHONES = {
  unnamed: "Unnamed phone",
  /** The list's name, for a screen reader. */
  list: "Paired phones",
  reading: "Reading your paired phones...",
  none: "No phone is paired with this account.",
  /** Home didn't give a list, and none was read before. */
  unreadNone: "Home didn't answer, so your phones can't be listed just now.",
  /** Home didn't give a list; the one shown is the last read. */
  unreadSome: "Home didn't answer, so this list may be out of date.",
  tryAgain: "Try again",
  rename: "Rename",
  nameLabel: "Name",
  nameHint: "Up to 40 characters. Leave it empty to clear the name.",
  nameRefused:
    "Home can't keep that name: up to 40 characters, with nothing hidden in it.",
  save: "Save",
  saving: "Saving...",
  cancel: "Cancel",
  signOut: "Sign out",
  signingOut: "Signing out...",
  confirmYes: "Yes, sign it out",
  confirmNo: "Keep it signed in",

  /** When it paired, or that home didn't keep the day. */
  paired: (pairedOn: string | null): string =>
    pairedOn === null
      ? "Paired before home kept the day"
      : `Paired ${formatDay(pairedOn)}`,

  /** When it was last used, as late as can be known. */
  used: (renewedAt: number): string =>
    `Used ${formatDay(dayOf(new Date(renewedAt)))} or later`,

  /** Asked before signing a phone out: what stays where. */
  confirm: (phone: Pick<Phone, "name">): string =>
    `Sign out ${phoneName(phone)}? It keeps everything on it, and home keeps everything it already sent. To send from it again, pair it again.`,

  /** What came of the last thing done to a phone. */
  said: (said: Said): string => {
    switch (said.kind) {
      case "named": {
        return said.name === null
          ? "The phone's name is cleared."
          : `Named ${said.name}.`
      }
      case "signedOut": {
        return `${thePhone(said.name)} is signed out. It keeps what it holds, and home keeps what it sent.`
      }
      case "notNamed": {
        const { why } = said
        switch (why) {
          case "refused": {
            return PHONES.nameRefused
          }
          case "gone": {
            return "That phone isn't paired anymore, so it can't be named."
          }
          case "failed": {
            return "Home didn't answer, so the name wasn't saved. Try again."
          }
          default: {
            return assertNever(why)
          }
        }
      }
      case "notSignedOut": {
        const { why } = said
        switch (why) {
          case "gone": {
            return "That phone was already signed out."
          }
          case "failed": {
            return "Home didn't answer, so the phone is still signed in. Try again."
          }
          default: {
            return assertNever(why)
          }
        }
      }
      default: {
        return assertNever(said)
      }
    }
  },
} as const
