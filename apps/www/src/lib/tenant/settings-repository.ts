import {
  DEFAULT_AUDIO_PREFERENCES,
  withAudioDefaults,
} from "../audio-preferences"
import type { StorageAdapter } from "./storage"
import {
  browserLocalStorage,
  delay,
  MOCK_LATENCY_MS,
  readJSON,
  writeJSON,
} from "./storage"
import type { UserSettings } from "./types"

const STORAGE_KEY = "some-ui.tenant.settings.v1"

export const DEFAULT_SETTINGS: UserSettings = {
  ttsProvider: "openai",
  ttsVoiceId: "",
  audio: DEFAULT_AUDIO_PREFERENCES,
  defaultSessionDurationMinutes: 10,
  defaultLayoutTree: "study",
}

export class SettingsRepository {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly latencyMs: number
  ) {}

  async get(): Promise<UserSettings> {
    await delay(this.latencyMs)
    const stored = readJSON(this.storage, STORAGE_KEY, DEFAULT_SETTINGS)
    // Settings persist as one blob under a single key, so a browser holding
    // a version of it written before a field existed hands that field back
    // as `undefined`. Filling the gap on read is cheaper than a migration
    // and cannot be forgotten the next time a field is added.
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      audio: withAudioDefaults(stored.audio),
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
