import type {
  LayoutTreeId,
  SessionActivity,
  TopikLevel,
} from "@some-ui/activity-catalog"
import type { HostedVoiceChoice } from "@some-ui/speech"
import type { SceneConfig, SlotId } from "@some-ui/types"
import type { LayoutNode } from "wireframes"

import type { AudioPreferences } from "@/lib/audio-preferences"
import type { NudgePreferences } from "@/lib/study-nudge"

/**
 * Re-exported: profile and activity levels must be the same strings
 * (`rankActivities` compares them), and the catalogue package owns them.
 */
export type { TopikLevel }

export type UserProfile = {
  id: string
  displayName: string
  avatar: string
  targetTopikLevel: TopikLevel
}

export type UserSettings = {
  /**
   * The hosted voice: a provider and its chosen voice, or `null` for the
   * provider's default. Typed so another provider's voice cannot be held.
   */
  ttsVoice: HostedVoiceChoice
  /**
   * The Android app's voice, as the phone's engine names it
   * (`ko-kr-x-ism-local`): a different catalogue from `ttsVoiceId`. Empty
   * means the phone's default Korean voice.
   */
  deviceVoiceId: string
  /** What this app may play, per channel; round-trips with the voice. */
  audio: AudioPreferences
  /** When this app may interrupt to say a session is waiting. */
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

/**
 * One activity as a stored session holds it. The id is a `string`, not an
 * `ActivityId`: the record outlives the catalogue it was composed from, so a
 * session can name an activity that has since been retired. Narrow it with
 * `findActivity` / `isActivityId` before treating it as a live one.
 */
export type StoredSessionActivity = Omit<SessionActivity, "activityId"> & {
  activityId: string
}

export type SessionRecord = {
  id: string
  name: string
  status: SessionStatus
  /** Friendly source config - lets a draft/scheduled session round-trip back into the composer. */
  activities: Array<StoredSessionActivity>
  /** Finalized, playable scenes - the source of truth once Advanced editing may have touched them. */
  scenes: Array<SceneConfig>
  layoutMode: "basic" | "advanced"
  /**
   * The session's own `Layout(t)`, one tree for its lifetime. Absent means a
   * single leaf filling `V`; only the live editor sets it. Scenes bind leaves
   * (`ui.panels`), never topology.
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
