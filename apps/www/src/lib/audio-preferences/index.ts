/**
 * What this app is allowed to play, and how loudly: audio *expectation* (does
 * the person want speech, game sounds), not browser playback permission. A
 * stated preference per channel, persisted with the tenant settings.
 *
 * A channel is listed only once something honours it, since a toggle that
 * controls nothing tells a person something is off while it plays:
 *
 * - **speech** - `@some-ui/speech`'s session, muted through
 *   `SpeechProvider`'s `muted` prop, which drops utterances at the queue.
 * - **effects** - honeycomb's `useGameAudio`, reached through
 *   `HangulHexGrid`'s `audio` prop and the session viewport's scene props.
 *
 * No background ambience: nothing plays any yet.
 */

import type { AudioChannelId } from "@some-ui/activity-catalog"

/**
 * Re-exported: `@some-ui/activity-catalog` owns the ids, where activities
 * declare the channels they use; this is what the person allows.
 */
export type { AudioChannelId }

type AudioChannelPreference = {
  enabled: boolean
  /** 0-1. Honoured per channel; each owner clamps into its own range. */
  volume: number
}

export type AudioPreferences = Record<AudioChannelId, AudioChannelPreference>

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = {
  // On by default: pronunciation is the content in the Korean modules, and
  // the disclosure layers (indicator, first-use notice) make it no surprise.
  speech: { enabled: true, volume: 1 },
  effects: { enabled: true, volume: 0.5 },
}

export type AudioChannelDefinition = {
  id: AudioChannelId
  label: string
  /** One line, in a person's terms, about what this channel actually is. */
  description: string
}

export const AUDIO_CHANNELS: ReadonlyArray<AudioChannelDefinition> = [
  {
    id: "speech",
    label: "Speech",
    description: "Pronunciation, spoken prompts and read-aloud text.",
  },
  {
    id: "effects",
    label: "Game sounds",
    description: "Short success, miss and timer sounds in the games.",
  },
]

export type AudioSummary = {
  /** A glyph for the chrome. Distinct per state, not just on/off. */
  icon: string
  /** What the indicator says, and what its accessible name reads. */
  label: string
}

/**
 * The one-line answer to "what can this app do to my ears right now?", for
 * the persistent indicator.
 */
export function summarizeAudio(preferences: AudioPreferences): AudioSummary {
  const speech = preferences.speech.enabled
  const effects = preferences.effects.enabled

  if (speech && effects) return { icon: "🔉", label: "Voice + Effects" }
  if (speech) return { icon: "🔊", label: "Voice" }
  if (effects) return { icon: "🎵", label: "Effects" }
  return { icon: "🔇", label: "Sound off" }
}

/** True when nothing at all may play. */
export function isFullyMuted(preferences: AudioPreferences): boolean {
  return AUDIO_CHANNELS.every(({ id }) => !preferences[id].enabled)
}

export function setChannelEnabled(
  preferences: AudioPreferences,
  channel: AudioChannelId,
  enabled: boolean
): AudioPreferences {
  return {
    ...preferences,
    [channel]: { ...preferences[channel], enabled },
  }
}

export function setChannelVolume(
  preferences: AudioPreferences,
  channel: AudioChannelId,
  volume: number
): AudioPreferences {
  return {
    ...preferences,
    [channel]: {
      ...preferences[channel],
      volume: Math.max(0, Math.min(1, volume)),
    },
  }
}

/** Turns every channel on or off in one action. */
export function setAllEnabled(
  preferences: AudioPreferences,
  enabled: boolean
): AudioPreferences {
  return AUDIO_CHANNELS.reduce<AudioPreferences>(
    (next, { id }) => setChannelEnabled(next, id, enabled),
    preferences
  )
}

/**
 * Fills in channels a stored preference blob predates (settings persist as
 * one JSON object), or `preferences.speech.enabled` would read `undefined`.
 */
export function withAudioDefaults(
  stored: Partial<AudioPreferences> | undefined
): AudioPreferences {
  return AUDIO_CHANNELS.reduce<AudioPreferences>(
    (next, { id }) => ({
      ...next,
      [id]: { ...DEFAULT_AUDIO_PREFERENCES[id], ...stored?.[id] },
    }),
    DEFAULT_AUDIO_PREFERENCES
  )
}
