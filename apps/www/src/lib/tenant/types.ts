import type { SceneConfig } from "some-types-utils"
import type { TTSProvider } from "some-ui-utils"

import type { LayoutTreeId, SessionActivity } from "../activity-catalog"

export type TopikLevel = "beginner" | "intermediate" | "advanced"

export type UserProfile = {
  id: string
  displayName: string
  avatar: string
  targetTopikLevel: TopikLevel
}

export type ThemePreference = "light" | "dark" | "system"

export type UserSettings = {
  ttsProvider: TTSProvider
  /** Empty string means "use the provider's default voice". */
  ttsVoiceId: string
  defaultSessionDurationMinutes: number
  defaultLayoutTree: LayoutTreeId
  theme: ThemePreference
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
  totalDurationMs: number
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  /** How far playback actually got, in ms - set when the session reaches a terminal state. */
  finalElapsedMs?: number
}
