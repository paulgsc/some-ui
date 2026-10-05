import type { HostedVoiceChoice } from "@some-ui/speech"
import { isTTSProvider, parseHostedVoiceChoice } from "@some-ui/speech"

import {
  DEFAULT_AUDIO_PREFERENCES,
  withAudioDefaults,
} from "@/lib/audio-preferences"
import { DEFAULT_NUDGE_PREFERENCES, withNudgeDefaults } from "@/lib/study-nudge"
import type { StorageAdapter } from "@/lib/tenant/storage"
import {
  browserLocalStorage,
  delay,
  MOCK_LATENCY_MS,
  readJSON,
  writeJSON,
} from "@/lib/tenant/storage"
import type { UserSettings } from "@/lib/tenant/types"

const STORAGE_KEY = "some-ui.tenant.settings.v1"

export const DEFAULT_SETTINGS: UserSettings = {
  ttsVoice: { provider: "openai", voiceId: null },
  deviceVoiceId: "",
  audio: DEFAULT_AUDIO_PREFERENCES,
  notifications: DEFAULT_NUDGE_PREFERENCES,
  defaultSessionDurationMinutes: 10,
  defaultLayoutTree: "study",
}

/** The two strings `ttsVoice` replaced, still in blobs saved before it. */
type LegacyVoiceFields = {
  ttsProvider?: string
  ttsVoiceId?: string
}

/**
 * The stored voice, as a choice. Storage holds strings whatever the type
 * says, so this is where they are checked: an unknown provider reads as the
 * default one, and a voice that is not that provider's (removed from the
 * catalogue, or never valid) reads as nothing chosen, which Settings then
 * shows as the default rather than as a voice that will not speak.
 */
function readVoice(provider: unknown, voiceId: unknown): HostedVoiceChoice {
  return parseHostedVoiceChoice(
    isTTSProvider(provider) ? provider : DEFAULT_SETTINGS.ttsVoice.provider,
    typeof voiceId === "string" ? voiceId : null
  )
}

export class SettingsRepository {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly latencyMs: number
  ) {}

  async get(): Promise<UserSettings> {
    await delay(this.latencyMs)
    const { ttsProvider, ttsVoiceId, ttsVoice, ...stored } = readJSON<
      Partial<UserSettings> & LegacyVoiceFields
    >(this.storage, STORAGE_KEY, DEFAULT_SETTINGS)
    // Settings persist as one blob under a single key, so a browser holding
    // a version of it written before a field existed hands that field back
    // as `undefined`. Filling the gap on read is cheaper than a migration
    // and cannot be forgotten the next time a field is added.
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      ttsVoice: readVoice(
        ttsVoice?.provider ?? ttsProvider,
        ttsVoice?.voiceId ?? ttsVoiceId
      ),
      audio: withAudioDefaults(stored.audio),
      notifications: withNudgeDefaults(stored.notifications),
    }
  }

  async save(settings: UserSettings): Promise<UserSettings> {
    await delay(this.latencyMs)
    writeJSON(this.storage, STORAGE_KEY, settings)
    return settings
  }
}

export function createSettingsRepository(
  storage: StorageAdapter = browserLocalStorage,
  latencyMs: number = MOCK_LATENCY_MS
): SettingsRepository {
  return new SettingsRepository(storage, latencyMs)
}
