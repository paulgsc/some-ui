/**
 * Home's switches as this page holds them: a pure state union and `step`
 * (CLAUDE.md, "React is not the coordinator"). `./runtime` owns the calls to
 * home and feeds their endings in here; the page reads a snapshot.
 *
 * One switch today: Rust Rounds recording (the administration epic's first
 * lever, #2357). Home keeps every change, and reads an untouched switch as
 * its default, which for recording is on.
 */
import { assertNever } from "@some-ui/core-utils"

/** Who set a switch: the owner's account, or an operator home lists. */
export type SetBy = "owner" | "operator"

/** A switch as home follows it. `set` is null while nobody has set it. */
export type Standing = {
  readonly recording: boolean
  readonly set: { readonly by: SetBy; readonly at: string } | null
}

/** Why home's answer did not come, in terms the words can say. */
export type Refusal =
  | "signed-out"
  | "not-operator"
  | "not-on-home"
  | "unreachable"
  | "no-home"
  | "failed"

export type SwitchesState =
  | { readonly kind: "reading" }
  | { readonly kind: "unread"; readonly why: Refusal }
  | {
      readonly kind: "read"
      readonly standing: Standing
      /** The value being set, until home answers; null when none is. */
      readonly setting: boolean | null
    }

export type SwitchesEvent =
  | { readonly type: "read-asked" }
  | { readonly type: "read"; readonly standing: Standing }
  | { readonly type: "read-failed"; readonly why: Refusal }
  | { readonly type: "set-asked"; readonly recording: boolean }
  | { readonly type: "set"; readonly standing: Standing }
  | { readonly type: "set-failed"; readonly why: Refusal }

export const INITIAL_SWITCHES: SwitchesState = { kind: "reading" }

/** Whether a set may be asked now: the switch is read and none is under way. */
export function canSet(state: SwitchesState): boolean {
  return state.kind === "read" && state.setting === null
}

/**
 * The next state. An event that does not fit the state it arrives in (a
 * second set while one is under way, a read's answer while a set is) leaves
 * the state as it is, the same object, so the runtime can tell it changed
 * nothing.
 */
export function stepSwitches(
  state: SwitchesState,
  event: SwitchesEvent
): SwitchesState {
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
        ? { ...state, setting: event.recording }
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
