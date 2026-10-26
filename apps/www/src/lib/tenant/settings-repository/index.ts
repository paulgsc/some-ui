import type { KeyedStorage } from "@some-ui/core-utils"
import { jsonOf, openKept, readWhole, writeKept } from "@some-ui/core-utils"
import type { HostedVoiceChoice } from "@some-ui/speech"
import { isTTSProvider, parseHostedVoiceChoice } from "@some-ui/speech"

import {
  DEFAULT_AUDIO_PREFERENCES,
  withAudioDefaults,
} from "@/lib/audio-preferences"
import { DEFAULT_NUDGE_PREFERENCES, withNudgeDefaults } from "@/lib/study-nudge"
import {
  browserLocalStorage,
  delay,
  MOCK_LATENCY_MS,
  NotKeptError,
} from "@/lib/tenant/storage"
import type { UserSettings } from "@/lib/tenant/types"

const STORAGE_KEY = "some-ui.tenant.settings.v1"

export const DEFAULT_SETTINGS: UserSettings = {
  ttsVoice: { provider: "openai", voiceId: null },
  deviceVoiceId: "",
  audio: DEFAULT_AUDIO_PREFERENCES,
  notifications: DEFAULT_NUDGE_PREFERENCES,
}

/** The two strings `ttsVoice` replaced, still in blobs saved before it. */
type LegacyVoiceFields = {
  ttsProvider?: string
  ttsVoiceId?: string
}

type StoredSettings = Partial<UserSettings> & LegacyVoiceFields

/**
 * Stored settings are a JSON object, read field by field in `get`; anything
 * else is moved aside.
 */
const readSettings = readWhole((raw): StoredSettings | null => {
  const value = jsonOf(raw)
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : null
})

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
    private readonly storage: KeyedStorage,
    private readonly latencyMs: number
  ) {}

  async get(): Promise<UserSettings> {
    await delay(this.latencyMs)
    const { ttsProvider, ttsVoiceId, ttsVoice, ...stored } = openKept(
      this.storage,
      STORAGE_KEY,
      readSettings,
      DEFAULT_SETTINGS
    ).value
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

  /** Throws `NotKeptError` rather than write over what it could not read. */
  async save(settings: UserSettings): Promise<UserSettings> {
    await delay(this.latencyMs)
    if (!writeKept(this.storage, STORAGE_KEY, settings, readSettings)) {
      throw new NotKeptError()
    }
    return settings
  }
}

export function createSettingsRepository(
  storage: KeyedStorage = browserLocalStorage,
  latencyMs: number = MOCK_LATENCY_MS
): SettingsRepository {
  return new SettingsRepository(storage, latencyMs)
}
