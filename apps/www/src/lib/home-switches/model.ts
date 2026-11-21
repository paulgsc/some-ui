/**
 * Home's switches as this page holds them: a pure state union and `step`
 * (CLAUDE.md, "React is not the coordinator"). `./runtime` owns the calls to
 * home and feeds their endings in here; the page reads a snapshot.
 *
 * One state per setting (`SettingKey`), each holding its own kind of value
 * (`SettingValue`, C916): Rust Rounds recording (the administration epic's
 * first lever, #2357) and whether home follows NFL games, each on or off,
 * and which teams' games it follows live (#3329), a list where none means
 * every game. Home keeps every change, and reads an untouched setting as its
 * default: on, on, and every game.
 */
import { assertNever } from "@some-ui/core-utils"

/** Each switch home has, on or off. */
export const SWITCH_KEYS = ["rust-rounds", "game-feed"] as const

export type SwitchKey = (typeof SWITCH_KEYS)[number]

/** Each setting the page shows a row, and a runtime, for, in its order. */
export const SETTING_KEYS = [...SWITCH_KEYS, "game-teams"] as const

export type SettingKey = (typeof SETTING_KEYS)[number]

/**
 * The value each setting holds, known at compile time (C916): a new setting
 * is a key here, and the compiler then asks for its client's codec
 * (`./client`) and its words (`./words`).
 */
export type SettingValue = {
  readonly "rust-rounds": boolean
  readonly "game-feed": boolean
  /** ESPN's abbreviations, sorted, each once; none is every game. */
  readonly "game-teams": ReadonlyArray<string>
}

/** Who set a switch: the owner's account, or an operator home lists. */
export type SetBy = "owner" | "operator"

/** A setting as home follows it. `set` is null while nobody has set it. */
export type Standing<K extends SettingKey = SettingKey> = {
  readonly value: SettingValue[K]
  readonly set: { readonly by: SetBy; readonly at: string } | null
}

/** Why home's answer did not come, in terms the words can say. */
export type Refusal =
  | "signed-out"
  | "not-operator"
  | "not-on-home"
  /** Home answered and didn't take the value given. */
  | "refused"
  | "unreachable"
  | "no-home"
  | "failed"

export type SwitchesState<K extends SettingKey = SettingKey> =
  | { readonly kind: "reading" }
  | { readonly kind: "unread"; readonly why: Refusal }
  | {
      readonly kind: "read"
      readonly standing: Standing<K>
      /** The value being set, until home answers; null when none is. */
      readonly setting: SettingValue[K] | null
    }

export type SwitchesEvent<K extends SettingKey = SettingKey> =
  | { readonly type: "read-asked" }
  | { readonly type: "read"; readonly standing: Standing<K> }
  | { readonly type: "read-failed"; readonly why: Refusal }
  | { readonly type: "set-asked"; readonly value: SettingValue[K] }
  | { readonly type: "set"; readonly standing: Standing<K> }
  | { readonly type: "set-failed"; readonly why: Refusal }

export const INITIAL_SWITCHES: { readonly kind: "reading" } = {
  kind: "reading",
}

/** Whether a set may be asked now: the setting is read and none is under way. */
export function canSet<K extends SettingKey>(state: SwitchesState<K>): boolean {
  return state.kind === "read" && state.setting === null
}

/**
 * The next state. An event that does not fit the state it arrives in (a
 * second set while one is under way, a read's answer while a set is) leaves
 * the state as it is, the same object, so the runtime can tell it changed
 * nothing.
 */
export function stepSwitches<K extends SettingKey>(
  state: SwitchesState<K>,
  event: SwitchesEvent<K>
): SwitchesState<K> {
  switch (event.type) {
    case "read-asked": {
      // A read never replaces a set under way: the set's answer is newer.
      return state.kind === "read" && state.setting !== null
        ? state
        : { kind: "reading" }
    }
    case "read": {
      return state.kind === "reading"
        ? { kind: "read", standing: event.standing, setting: null }
        : state
    }
    case "read-failed": {
      return state.kind === "reading"
        ? { kind: "unread", why: event.why }
        : state
    }
    case "set-asked": {
      return canSet(state) && state.kind === "read"
        ? { ...state, setting: event.value }
        : state
    }
    case "set": {
      return state.kind === "read" && state.setting !== null
        ? { kind: "read", standing: event.standing, setting: null }
        : state
    }
    case "set-failed": {
      // A set that did not answer may still have landed (home took it and
      // the answer was lost or late), so the standing held here is no
      // longer known: the page asks home again (`./runtime` reads) rather
      // than show the value from before the set. The failure is said over
      // the screen (`./runtime`'s `notify`), not in the layout.
      return state.kind === "read" && state.setting !== null
        ? { kind: "reading" }
        : state
    }
    default: {
      return assertNever(event)
    }
  }
}
