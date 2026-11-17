/**
 * The lan web's list of the phones paired with this account (SIGNIN7,
 * #3095): what it shows and what the owner is doing to one phone, as a pure
 * `step`. The runtime (`./runtime`) owns the requests and drops an answer a
 * newer read has passed; the component reads a snapshot and dispatches.
 *
 * One thing at a time: naming a phone, asking before signing one out, or
 * waiting on home for either. A read can land beside any of them: it
 * replaces the list, and a phone it no longer lists ends what was being
 * done to it. What came of the last thing done is `said`, which the screen
 * says over itself (a `Notice`) until the next thing starts.
 */
import { assertNever } from "@some-ui/core-utils"

/** One paired phone as its owner sees it (paulgsc/server `PhoneView`). */
export type Phone = {
  readonly id: string
  /** The UTC day it paired, `YYYY-MM-DD`; null when home didn't keep it. */
  readonly pairedOn: string | null
  /** The owner's name for it; null until they name it. */
  readonly name: string | null
  /** ms since the epoch: when its sign-in last started or renewed (C493). */
  readonly renewedAt: number
}

/** The list as last read. */
export type List =
  | { readonly kind: "reading" }
  | { readonly kind: "read"; readonly phones: ReadonlyArray<Phone> }
  /** Home didn't give a list (away, say); the last one read stays shown. */
  | {
      readonly kind: "unread"
      readonly phones: ReadonlyArray<Phone> | null
    }

/** What the owner is doing to one phone. */
type Doing =
  | { readonly kind: "idle" }
  | { readonly kind: "naming"; readonly id: string; readonly text: string }
  | {
      readonly kind: "saving"
      readonly id: string
      readonly name: string | null
    }
  | { readonly kind: "confirming"; readonly id: string }
  | { readonly kind: "signingOut"; readonly id: string }

/** Why home didn't do what was asked. */
export type Refusal =
  /** Home refused the name (C498: too long, or a hidden character). */
  | "refused"
  /** Home no longer has this phone (signed out elsewhere, say). */
  | "gone"
  /** No answer, or one that said nothing. */
  | "failed"

/** What came of the last thing done to a phone, said over the screen. */
export type Said =
  | { readonly kind: "named"; readonly name: string | null }
  | { readonly kind: "signedOut"; readonly name: string | null }
  | {
      readonly kind: "notNamed"
      readonly why: Refusal
    }
  | {
      readonly kind: "notSignedOut"
      readonly why: Exclude<Refusal, "refused">
    }

export type PhonesState = {
  readonly list: List
  readonly doing: Doing
  readonly said: Said | null
}

export const INITIAL: PhonesState = {
  list: { kind: "reading" },
  doing: { kind: "idle" },
  said: null,
}

export type PhonesEvent =
  | { readonly type: "readStarted" }
  | { readonly type: "read"; readonly phones: ReadonlyArray<Phone> }
  | { readonly type: "readFailed" }
  | { readonly type: "renamePressed"; readonly id: string }
  | { readonly type: "typed"; readonly text: string }
  /** The owner pressed Save with a name `lib/phone-name` took. */
  | { readonly type: "savePressed"; readonly name: string | null }
  | {
      readonly type: "saved"
      readonly id: string
      readonly name: string | null
    }
  | { readonly type: "saveFailed"; readonly id: string; readonly why: Refusal }
  | { readonly type: "signOutPressed"; readonly id: string }
  | { readonly type: "confirmed" }
  | { readonly type: "signedOut"; readonly id: string }
  | {
      readonly type: "signOutFailed"
      readonly id: string
      readonly why: Exclude<Refusal, "refused">
    }
  | { readonly type: "cancelled" }
  | { readonly type: "dismissed" }

const IDLE: Doing = { kind: "idle" }

/** The phones the list shows now, if any were read. */
export function phonesOf(list: List): ReadonlyArray<Phone> | null {
  switch (list.kind) {
    case "reading": {
      return null
    }
    case "read":
    case "unread": {
      return list.phones
    }
    default: {
      return assertNever(list)
    }
  }
}

/** The phone `id` in `list`, if it lists it. */
function phoneIn(list: List, id: string): Phone | undefined {
  return phonesOf(list)?.find((phone) => phone.id === id)
}

/** The list with `id`'s phone changed by `change`, or dropped by `null`. */
function withPhone(
  list: List,
  id: string,
  change: (phone: Phone) => Phone | null
): List {
  if (list.kind !== "read") return list
  const phones = list.phones.flatMap((phone) => {
    if (phone.id !== id) return [phone]
    const next = change(phone)
    return next === null ? [] : [next]
  })
  return { kind: "read", phones }
}

/** Whether nothing is being done to a phone, so another may start. */
const free = (state: PhonesState): boolean => state.doing.kind === "idle"

export function step(state: PhonesState, event: PhonesEvent): PhonesState {
  switch (event.type) {
    case "readStarted": {
      // A read again keeps the list shown until it lands.
      return state
    }
    case "read": {
      // Whatever was being done to a phone home no longer lists ends: it was
      // signed out elsewhere, or by this list a moment ago.
      const { doing } = state
      const kept =
        doing.kind === "idle" ||
        event.phones.some((phone) => phone.id === doing.id)
      return {
        ...state,
        list: { kind: "read", phones: event.phones },
        doing: kept ? doing : IDLE,
      }
    }
    case "readFailed": {
      return {
        ...state,
        list: { kind: "unread", phones: phonesOf(state.list) },
      }
    }
    case "renamePressed": {
      const phone = phoneIn(state.list, event.id)
      if (!free(state) || phone === undefined) return state
      return {
        ...state,
        doing: { kind: "naming", id: event.id, text: phone.name ?? "" },
        said: null,
      }
    }
    case "typed": {
      if (state.doing.kind !== "naming") return state
      return { ...state, doing: { ...state.doing, text: event.text } }
    }
    case "savePressed": {
      if (state.doing.kind !== "naming") return state
      return {
        ...state,
        doing: { kind: "saving", id: state.doing.id, name: event.name },
      }
    }
    case "saved": {
      if (state.doing.kind !== "saving" || state.doing.id !== event.id) {
        return state
      }
      return {
        list: withPhone(state.list, event.id, (phone) => ({
          ...phone,
          name: event.name,
        })),
        doing: IDLE,
        said: { kind: "named", name: event.name },
      }
    }
    case "saveFailed": {
      if (state.doing.kind !== "saving" || state.doing.id !== event.id) {
        return state
      }
      const { id, name } = state.doing
      return {
        list:
          event.why === "gone"
            ? withPhone(state.list, id, () => null)
            : state.list,
        // A refused or unanswered name stays in the field to fix or try
        // again; a phone home no longer has has nothing left to name.
        doing:
          event.why === "gone"
            ? IDLE
            : { kind: "naming", id, text: name ?? "" },
        said: { kind: "notNamed", why: event.why },
      }
    }
    case "signOutPressed": {
      if (!free(state) || phoneIn(state.list, event.id) === undefined) {
        return state
      }
      return {
        ...state,
        doing: { kind: "confirming", id: event.id },
        said: null,
      }
    }
    case "confirmed": {
      if (state.doing.kind !== "confirming") return state
      return { ...state, doing: { kind: "signingOut", id: state.doing.id } }
    }
    case "signedOut": {
      if (state.doing.kind !== "signingOut" || state.doing.id !== event.id) {
        return state
      }
      const name = phoneIn(state.list, event.id)?.name ?? null
      return {
        list: withPhone(state.list, event.id, () => null),
        doing: IDLE,
        said: { kind: "signedOut", name },
      }
    }
    case "signOutFailed": {
      if (state.doing.kind !== "signingOut" || state.doing.id !== event.id) {
        return state
      }
      return {
        // Home no longer has it: it is signed out already.
        list:
          event.why === "gone"
            ? withPhone(state.list, event.id, () => null)
            : state.list,
        doing: IDLE,
        said: { kind: "notSignedOut", why: event.why },
      }
    }
    case "cancelled": {
      // Only what hasn't gone to home yet can be called off.
      if (state.doing.kind !== "naming" && state.doing.kind !== "confirming") {
        return state
      }
      return { ...state, doing: IDLE }
    }
    case "dismissed": {
      return state.said === null ? state : { ...state, said: null }
    }
    default: {
      return assertNever(event)
    }
  }
}
