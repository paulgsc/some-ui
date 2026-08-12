/**
 * Session-free payload types shared by the extract layer and the FSM.
 * Zero runtime — imported as `import type` everywhere.
 *
 * Scope note: the *state union* itself (Masked/MetaState/… and the transition
 * functions over them) lives in `lib/content/fsm.ts`, because every state there
 * carries a SessionId and that is what makes cross-session transitions
 * unrepresentable (fsm.ts F1). This module previously carried a second,
 * session-free copy of that union — structurally assignable to the real one, so
 * the compiler could not tell them apart and a state could silently lose its
 * session on the way through a signature. Only the leaf payloads live here now:
 * they are what the extract layer produces, and the extract layer has no
 * session to carry.
 */

export type MetaData = {
  readonly channelName: string | null
  readonly duration: string | null
  readonly uploadDate: string | null
}

export type TitleData = {
  readonly text: string
  readonly translated: boolean
}

/** Committed interactions, as emitted by the ClickGate and the whitelist path. */
export type FsmEvent = "CLICK" | "DBLCLICK" | "WHITELIST"

/**
 * Accent of the hint pill. Semantic, not a colour: the FSM projects a tone and
 * `veil-styles.ts` decides what indigo, violet or mint means for it. Lives here
 * rather than in fsm.ts so the presentation layer can name a tone without
 * importing the state machine.
 */
export type HintTone = "idle" | "meta" | "title" | "whitelist"

/** How far along the disclosure ladder the progress rail should read. */
export type RailStep = 0 | 1 | 2
