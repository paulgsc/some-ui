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
  defaultSessionDurationMinutes: 10,
  defaultLayoutTree: "study",
  theme: "system",
}

export class SettingsRepository {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly latencyMs: number
  ) {}

  async get(): Promise<UserSettings> {
    await delay(this.latencyMs)
    return readJSON(this.storage, STORAGE_KEY, DEFAULT_SETTINGS)
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
