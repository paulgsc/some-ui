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

import type {
  HintTone,
  MetaData,
  RailStep,
  TitleData,
} from "@censor/types/states"
import type { SessionId } from "@some-extension/common"
import { assertNever } from "@some-extension/common"

export type { MetaData, TitleData }

// ── State variants ────────────────────────────────────────────────────────────

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

export function applyClick(s: Masked, meta: MetaData): MetaState

export function applyClick(s: MetaState, rawTitle: string): TitleState

export function applyClick(s: TitleState | Revealed | Whitelisted): typeof s

export function applyClick(
  s: ViewState,
  payload?: MetaData | string
): ViewState {
  const { kind } = s
  switch (kind) {
    case "masked": {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      return { kind: "meta", session: s.session, meta: payload as MetaData }
    }

    case "meta": {
      return {
        kind: "title",
        session: s.session,
        meta: s.meta,
        title: {
          text: typeof payload === "string" ? payload : "",
          translated: false,
        },
      }
    }
    case "title":
    case "revealed":
    case "whitelisted": {
      return s
    }
    default: {
      kind satisfies never
      assertNever(kind)
    }
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

/**
 * The hint pill's copy and accent.
 *
 * This used to live in the stylesheet as five `content:` strings on
 * `.boyo-veil::before`, keyed by `[data-boyo]`. Projecting it instead means the
 * copy for a state sits next to the state, the pill can be a real element that
 * a container query and a screen reader can both see, and adding a state makes
 * the exhaustive switch below fail to compile rather than silently rendering a
 * pill with no text.
 */
export type HintModel = {
  readonly label: string
  readonly tone: HintTone
}

/** Which role the veil is playing — occluding the card, or merely tinting it. */
export type VeilTone = "occluding" | "whitelisted"

export type RenderModel = {
  readonly dataBoyo: DataBoyo
  readonly veilTone: VeilTone
  /** `null` while the veil is on its way out. */
  readonly hint: HintModel | null
  readonly veilContent: VeilContent
  readonly rail: RailStep
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
  const { kind } = state
  switch (kind) {
    case "masked": {
      return {
        dataBoyo: "0",
        veilTone: "occluding",
        hint: { label: "Click to preview", tone: "idle" },
        veilContent: { kind: "empty" },
        rail: 0,
        removeVeil: false,
      }
    }

    case "meta": {
      return {
        dataBoyo: "1",
        veilTone: "occluding",
        hint: { label: "Click for title", tone: "meta" },
        veilContent: { kind: "meta", meta: state.meta },
        rail: 1,
        removeVeil: false,
      }
    }

    case "title": {
      return {
        dataBoyo: "2",
        veilTone: "occluding",
        hint: { label: "Double-click to reveal", tone: "title" },
        veilContent: { kind: "title", meta: state.meta, title: state.title },
        rail: 2,
        removeVeil: false,
      }
    }

    case "revealed": {
      return {
        dataBoyo: "3",
        veilTone: "occluding",
        hint: null,
        veilContent: { kind: "empty" },
        rail: 2,
        removeVeil: true,
      }
    }

    case "whitelisted": {
      return {
        dataBoyo: "wl",
        veilTone: "whitelisted",
        hint: { label: "Whitelisted", tone: "whitelist" },
        veilContent: { kind: "empty" },
        rail: 0,
        removeVeil: false,
      }
    }
    default: {
      kind satisfies never
      assertNever(kind)
    }
  }
}
