/**
 * My data's Korean word sets page (MY-DATA MD7, #2496): the state it shows
 * and its pure step. Each set the phone keeps for Read aloud, in use or
 * archived; archiving is the owner's own act, never a rule (call C232), and
 * keeps the set whole on the phone. `./word-sets-runtime` owns the store and
 * says what was pressed; `./words`' `WORD_SETS` says it.
 */
import { assertNever } from "@some-ui/core-utils"
import type { WordSetsList } from "@some-ui/topik"

/** What the page says over the screen about what was just done (HS1). */
export type WordSetsSaid =
  | { readonly kind: "archived"; readonly id: string; readonly title: string }
  | { readonly kind: "broughtBack"; readonly title: string }
  /** The phone couldn't keep the change, so nothing changed. */
  | { readonly kind: "notKept" }
  /** Every place in use is taken, so the set stays archived. */
  | { readonly kind: "noRoom"; readonly limit: number }

export type WordSetsState =
  | { readonly kind: "reading" }
  /** The phone's word sets couldn't be read. */
  | { readonly kind: "unread" }
  | {
      readonly kind: "read"
      readonly list: WordSetsList
      readonly said: WordSetsSaid | null
      /** Counts what was said, so the same words said again show again. */
      readonly saidCount: number
    }

export type WordSetsEvent =
  | { readonly type: "read"; readonly list: WordSetsList }
  | { readonly type: "unread" }
  | {
      readonly type: "did"
      readonly list: WordSetsList
      readonly said: WordSetsSaid
    }
  | { readonly type: "dismissed" }

export const READING: WordSetsState = { kind: "reading" }

export function stepWordSets(
  state: WordSetsState,
  event: WordSetsEvent
): WordSetsState {
  switch (event.type) {
    case "read": {
      return state.kind === "read"
        ? { ...state, list: event.list }
        : { kind: "read", list: event.list, said: null, saidCount: 0 }
    }
    case "unread": {
      return state.kind === "read" ? state : { kind: "unread" }
    }
    case "did": {
      return {
        kind: "read",
        list: event.list,
        said: event.said,
        saidCount: state.kind === "read" ? state.saidCount + 1 : 1,
      }
    }
    case "dismissed": {
      return state.kind === "read" && state.said !== null
        ? { ...state, said: null }
        : state
    }
    default: {
      return assertNever(event)
    }
  }
}
