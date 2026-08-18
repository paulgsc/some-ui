import type {
  LayoutTreeId,
  SessionActivity,
  TopikLevel,
} from "@some-ui/activity-catalog"
import type { TTSProvider } from "@some-ui/speech"
import type { SceneConfig, SlotId } from "@some-ui/types"
import type { LayoutNode } from "wireframes"

import type { AudioPreferences } from "@/lib/audio-preferences"
import type { NudgePreferences } from "@/lib/study-nudge"

/**
 * Re-exported rather than redeclared: the levels a profile can target and the
 * levels an activity offers have to be the same three strings, and
 * `rankActivities` is the code that compares them. The catalogue package owns
 * the vocabulary; this is the profile field that points at it.
 */
export type { TopikLevel }

export type UserProfile = {
  id: string
  displayName: string
  avatar: string
  targetTopikLevel: TopikLevel
}

export type UserSettings = {
  ttsProvider: TTSProvider
  /** Empty string means "use the provider's default voice". */
  ttsVoiceId: string
  /**
   * What this app may play, per channel. Lives with the rest of the tenant
   * settings rather than in its own store so that a person's audio choices
   * round-trip exactly like their voice choice does.
   */
  audio: AudioPreferences
  /**
   * When this app may interrupt you to say a session is waiting. Sits with
   * the audio preferences rather than in its own store for the same reason
   * they do - it is one more statement about what this app is allowed to
   * do unprompted, and the three should round-trip together.
   */
  notifications: NudgePreferences
  defaultSessionDurationMinutes: number
  defaultLayoutTree: LayoutTreeId
}

export type SessionStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "paused"
  | "completed"

export type SessionRecord = {
  id: string
  name: string
  status: SessionStatus
  /** Friendly source config - lets a draft/scheduled session round-trip back into the composer. */
  activities: Array<SessionActivity>
  /** Finalized, playable scenes - the source of truth once Advanced editing may have touched them. */
  scenes: Array<SceneConfig>
  layoutMode: "basic" | "advanced"
  /**
   * The session's own `Layout(t)`, one tree for its entire lifetime.
   * Absent means the naive default (a single leaf filling `V`) - there's
   * no seeding step, only an explicit edit via the live editor ever sets
   * this. Scenes contribute bindings for these leaves (`ui.panels`), never
   * topology.
   */
  layout?: LayoutNode<SlotId>
  totalDurationMs: number
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  /** How far playback actually got, in ms - set when the session reaches a terminal state. */
  finalElapsedMs?: number
}
