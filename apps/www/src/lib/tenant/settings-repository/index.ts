import type { KeyedStorage, Salvaged } from "@some-ui/core-utils"
import { openKept, writeKept } from "@some-ui/core-utils"

import {
  DEFAULT_AUDIO_PREFERENCES,
  withAudioDefaults,
} from "@/lib/audio-preferences"
import { DEFAULT_NUDGE_PREFERENCES, withNudgeDefaults } from "@/lib/study-nudge"
import { readJsonObject } from "@/lib/tenant/json-object"
import {
  browserLocalStorage,
  delay,
  MOCK_LATENCY_MS,
  NotKeptError,
} from "@/lib/tenant/storage"
import type { UserSettings } from "@/lib/tenant/types"

const STORAGE_KEY = "some-ui.tenant.settings.v1"

export const DEFAULT_SETTINGS: UserSettings = {
  deviceVoiceId: "",
  audio: DEFAULT_AUDIO_PREFERENCES,
  notifications: DEFAULT_NUDGE_PREFERENCES,
}

/**
 * The hosted voice's fields, retired with the voice service (#2977): the
 * choice as a typed pair (`ttsVoice`) and the two strings it replaced. A
 * blob saved before then still holds them. Nothing reads them, and `save`
 * writes them back as they were stored, so the voice a person once chose is
 * never dropped from what this browser keeps.
 */
const RETIRED_FIELDS = ["ttsVoice", "ttsProvider", "ttsVoiceId"] as const

type RetiredField = (typeof RETIRED_FIELDS)[number]

type StoredSettings = Partial<UserSettings> &
  Partial<Record<RetiredField, unknown>>

/**
 * Stored settings are a JSON object, read field by field in `get`; anything
 * else is moved aside.
 */
const readSettings: (raw: string) => Salvaged<StoredSettings> | null =
  readJsonObject

export class SettingsRepository {
  constructor(
    private readonly storage: KeyedStorage,
    private readonly latencyMs: number
  ) {}

  async get(): Promise<UserSettings> {
    await delay(this.latencyMs)
    const {
      ttsVoice: _ttsVoice,
      ttsProvider: _ttsProvider,
      ttsVoiceId: _ttsVoiceId,
      ...stored
    } = this.stored()
    // Settings persist as one blob under a single key, so a browser holding
    // a version of it written before a field existed hands that field back
    // as `undefined`. Filling the gap on read is cheaper than a migration
    // and cannot be forgotten the next time a field is added.
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      audio: withAudioDefaults(stored.audio),
      notifications: withNudgeDefaults(stored.notifications),
    }
  }

  /** Throws `NotKeptError` rather than write over what it could not read. */
  async save(settings: UserSettings): Promise<UserSettings> {
    await delay(this.latencyMs)
    const stored = this.stored()
    const retired = Object.fromEntries(
      RETIRED_FIELDS.filter((field) => stored[field] !== undefined).map(
        (field) => [field, stored[field]]
      )
    )
    if (
      !writeKept(
        this.storage,
        STORAGE_KEY,
        { ...retired, ...settings },
        readSettings
      )
    ) {
      throw new NotKeptError()
    }
    return settings
  }

  private stored(): StoredSettings {
    return openKept<StoredSettings>(
      this.storage,
      STORAGE_KEY,
      readSettings,
      DEFAULT_SETTINGS
    ).value
  }
}

export function createSettingsRepository(
  storage: KeyedStorage = browserLocalStorage,
  latencyMs: number = MOCK_LATENCY_MS
): SettingsRepository {
  return new SettingsRepository(storage, latencyMs)
}
