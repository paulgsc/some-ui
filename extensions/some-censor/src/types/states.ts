/**
 * Discriminated union types for all state machines.
 * Zero runtime — imported as `import type` everywhere.
 */

import type { ChannelId, VideoId } from "./ids"

// ── Node lifecycle (Resolver output) ──────────────────────────────────────────

export type Unresolved = {
  readonly kind: "unresolved"
  readonly el: HTMLElement
}

export type Resolved = {
  readonly kind: "resolved"
  readonly el: HTMLElement
  readonly videoId: VideoId
  readonly channelId: ChannelId
}

export type Failed = {
  readonly kind: "failed"
  readonly el: HTMLElement
  readonly reason: "missing-video-id" | "missing-channel-id"
}

export type NodeState = Unresolved | Resolved | Failed

// ── View / UI FSM ─────────────────────────────────────────────────────────────

export type MetaData = {
  readonly channelName: string | null
  readonly duration: string | null
  readonly uploadDate: string | null
}

export type TitleData = {
  readonly text: string
  readonly translated: boolean
}

export type Masked = { readonly kind: "masked" }
export type MetaState = { readonly kind: "meta"; readonly meta: MetaData }
export type TitleState = {
  readonly kind: "title"
  readonly meta: MetaData
  readonly title: TitleData
}
export type Revealed = { readonly kind: "revealed" }
export type Whitelisted = { readonly kind: "whitelisted" }

export type ViewState = Masked | MetaState | TitleState | Revealed | Whitelisted

export type FsmEvent = "CLICK" | "DBLCLICK" | "WHITELIST"

// ── DOM mount state ───────────────────────────────────────────────────────────

export type Mounted = { readonly kind: "mounted"; readonly veil: HTMLElement }
export type Unmounted = { readonly kind: "unmounted"; readonly veil: null }
export type DomState = Mounted | Unmounted

export type ControllerState =
  | { kind: "booting" }
  | { kind: "active"; enabled: boolean }
  | { kind: "degraded"; reason: string; enabled: boolean }
