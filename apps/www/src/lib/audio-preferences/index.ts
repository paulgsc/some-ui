/**
 * What this app is allowed to play, and how loudly.
 *
 * Audio *permission* (can the browser play anything at all, has the user
 * gestured yet) and audio *expectation* (does the person want to be spoken
 * to, do they want game sounds) are different problems, and conflating them
 * is how apps end up with a single "sound on/off" switch that answers
 * neither. This module is only the second one: a stated preference per
 * channel, persisted with the rest of the tenant settings.
 *
 * ## Channels are only listed here once something honours them
 *
 * A toggle that controls nothing is worse than no toggle - it tells a
 * person they have turned something off while it keeps playing. So a
 * channel appears in this model only when there is a real seam behind it:
 *
 * - **speech** - `@some-ui/speech`'s session, muted through
 *   `SpeechProvider`'s `muted` prop, which drops utterances at the queue.
 * - **effects** - honeycomb's `useGameAudio`, reached through
 *   `HangulHexGrid`'s `audio` prop and the session viewport's scene props.
 *
 * Background ambience is deliberately absent: nothing in this repo plays
 * any. It gets a row here the day something does, and not before.
 */

export type AudioChannelId = "speech" | "effects"

type AudioChannelPreference = {
  enabled: boolean
  /** 0-1. Honoured per channel; each owner clamps into its own range. */
  volume: number
}

export type AudioPreferences = Record<AudioChannelId, AudioChannelPreference>

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = {
  // On by default, both of them. This is a learning app: pronunciation is
  // the content in the Korean modules, not decoration on top of it, and a
  // silent-by-default TTS lesson is a broken one. The disclosure layers
  // (the indicator, the first-use notice) exist precisely so that "on by
  // default" is not a surprise.
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
 * The one-line answer to "what can this app do to my ears right now?",
 * which is what the persistent indicator exists to show without
 * interrupting anyone.
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
 * Fills in channels a stored preference blob predates.
 *
 * Settings are persisted as one JSON object and `readJSON` hands back
 * whatever was written, so a browser holding a settings object from before
 * this module existed would otherwise produce `preferences.speech.enabled`
 * on `undefined` - a blank page rather than a missing toggle.
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
