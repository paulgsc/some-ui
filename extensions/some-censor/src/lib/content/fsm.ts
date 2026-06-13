/**
 * FSM types and pure transition functions.
 *
 * Design invariants:
 *
 *   F1 — Every state carries its SessionId.
 *        Cross-session transitions cannot be constructed — the new state always
 *        inherits `session` from the source state.  Reset is the ONLY function
 *        that accepts a *new* SessionId, and it returns only Masked.
 *
 *   F2 — Transition functions are overloaded: the compiler knows which source
 *        states are legal for each event.  Calling applyClick(revealed, el) is
 *        a compile error, not a silent no-op.
 *
 *   F3 — project() has an exhaustive switch over ViewState.kind.  Adding a new
 *        variant without updating project() is a compile error (noImplicitReturns
 *        + strict null checks catch the missing branch).
 *
 *   F4 — applyReset() requires a *caller-supplied* SessionId obtained from
 *        mkSession().  It cannot reuse the old session — the return type is
 *        `Masked` (not `ViewState`), so the old session is structurally gone.
 */

import type { SessionId } from "./session"

// ── State variants ────────────────────────────────────────────────────────────

export type MetaData = {
  readonly channelName: string | null
  readonly duration: string | null
  readonly uploadDate: string | null
}

export type TitleData = {
  readonly text: string
  readonly translated: boolean
}

export type Masked = {
  readonly kind: "masked"
  readonly session: SessionId
}

export type MetaState = {
  readonly kind: "meta"
  readonly session: SessionId
  readonly meta: MetaData
}

export type TitleState = {
  readonly kind: "title"
  readonly session: SessionId
  readonly meta: MetaData
  readonly title: TitleData
}

export type Revealed = {
  readonly kind: "revealed"
  readonly session: SessionId
}

export type Whitelisted = {
  readonly kind: "whitelisted"
  readonly session: SessionId
}

export type ViewState = Masked | MetaState | TitleState | Revealed | Whitelisted

// ── Transition functions ──────────────────────────────────────────────────────
//
// Each function is typed to accept only the states from which that event
// is meaningful.  The overload signatures are the machine's transition table.
// The implementation union handles structural sharing.

// eslint-disable-next-line no-redeclare
export function applyClick(s: Masked, meta: MetaData): MetaState
// eslint-disable-next-line no-redeclare
export function applyClick(s: MetaState, rawTitle: string): TitleState
// eslint-disable-next-line no-redeclare
export function applyClick(s: TitleState | Revealed | Whitelisted): typeof s
export function applyClick(
  s: ViewState,
  payload?: MetaData | string
): ViewState {
  switch (s.kind) {
    case "masked":
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      return { kind: "meta", session: s.session, meta: payload as MetaData }

    case "meta":
      return {
        kind: "title",
        session: s.session,
        meta: s.meta,
        title: { text: typeof payload === "string" ? payload : "", translated: false },
      }

    default:
      return s
  }
}

export function applyDblClick(s: ViewState): Revealed {
  return { kind: "revealed", session: s.session }
}

export function applyWhitelist(s: ViewState): Whitelisted {
  return { kind: "whitelisted", session: s.session }
}

/** Reset — mints a new Masked state bound to a *caller-supplied* new session. */
export function applyReset(newSession: SessionId): Masked {
  return { kind: "masked", session: newSession }
}

/**
 * applySkipToTitle - advance directly to TitleState from any pre-title state.
 *
 * Accepts Masked or Metastate (the only two states that are "below"  title).
 * Requires both MetaData and a title  string because TitleState carries both
 * (meta is displayed compactly above the title chip).
 *
 * Calles that have a Masked source must supply MetaData themselves (a DOM read
 * is required - same as _applyClickTransition does).
 */
export function applySkipToTitle(
  s: Masked | MetaState,
  meta: MetaData,
  titleText: string
): TitleState {
  return {
    kind: "title",
    session: s.session,
    meta,
    title: { text: titleText, translated: false },
  }
}

// ── RenderModel — pure projection output ─────────────────────────────────────

export type DataBoyo = "0" | "1" | "2" | "3" | "wl"

export type VeilContent =
  | { readonly kind: "empty" }
  | { readonly kind: "meta"; readonly meta: MetaData }
  | {
      readonly kind: "title"
      readonly meta: MetaData
      readonly title: TitleData
    }

export type RenderModel = {
  readonly dataBoyo: DataBoyo
  readonly veilContent: VeilContent
  readonly removeVeil: boolean // true only for "revealed"
}

/**
 * project — pure, total, exhaustive.
 *
 * The exhaustive switch means: adding a new ViewState variant without updating
 * this function is a compile error.  The test that "project is total" is
 * therefore redundant once the type system enforces it — but we keep it as
 * living documentation of intent.
 */
export function project(state: ViewState): RenderModel {
  switch (state.kind) {
    case "masked":
      return {
        dataBoyo: "0",
        veilContent: { kind: "empty" },
        removeVeil: false,
      }

    case "meta":
      return {
        dataBoyo: "1",
        veilContent: { kind: "meta", meta: state.meta },
        removeVeil: false,
      }

    case "title":
      return {
        dataBoyo: "2",
        veilContent: { kind: "title", meta: state.meta, title: state.title },
        removeVeil: false,
      }

    case "revealed":
      return {
        dataBoyo: "3",
        veilContent: { kind: "empty" },
        removeVeil: true,
      }

    case "whitelisted":
      return {
        dataBoyo: "wl",
        veilContent: { kind: "empty" },
        removeVeil: false,
      }

    // TypeScript will error here if a new variant is added to ViewState
    // without a corresponding branch (with noImplicitReturns: true).
  }
}