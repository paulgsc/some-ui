import type { StorageAdapter } from "@/lib/tenant/storage"
import {
  browserLocalStorage,
  delay,
  MOCK_LATENCY_MS,
  readJSON,
  writeJSON,
} from "@/lib/tenant/storage"
import type { UserProfile } from "@/lib/tenant/types"

const STORAGE_KEY = "some-ui.tenant.profile.v1"

export const DEFAULT_PROFILE: UserProfile = {
  id: "local-tenant",
  displayName: "You",
  avatar: "🙂",
  targetTopikLevel: "beginner",
}

export class ProfileRepository {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly latencyMs: number
  ) {}

  async get(): Promise<UserProfile> {
    await delay(this.latencyMs)
    return readJSON(this.storage, STORAGE_KEY, DEFAULT_PROFILE)
  }

  async save(profile: UserProfile): Promise<UserProfile> {
    await delay(this.latencyMs)
    writeJSON(this.storage, STORAGE_KEY, profile)
    return profile
  }
}

export function createProfileRepository(
  storage: StorageAdapter = browserLocalStorage,
  latencyMs: number = MOCK_LATENCY_MS
): ProfileRepository {
  return new ProfileRepository(storage, latencyMs)
}
