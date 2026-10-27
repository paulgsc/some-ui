import type { KeyedStorage } from "@some-ui/core-utils"
import {
  isRecord,
  jsonOf,
  openKept,
  readWhole,
  writeKept,
} from "@some-ui/core-utils"

import {
  browserLocalStorage,
  delay,
  MOCK_LATENCY_MS,
  NotKeptError,
} from "@/lib/tenant/storage"
import type { UserProfile } from "@/lib/tenant/types"

const STORAGE_KEY = "some-ui.tenant.profile.v1"

/** A stored profile is a JSON object; anything else is moved aside. */
const readProfile = readWhole((raw): Partial<UserProfile> | null => {
  const value = jsonOf(raw)
  return isRecord(value) ? value : null
})

export const DEFAULT_PROFILE: UserProfile = {
  id: "local-tenant",
  displayName: "You",
  avatar: "🙂",
  targetTopikLevel: "beginner",
}

export class ProfileRepository {
  constructor(
    private readonly storage: KeyedStorage,
    private readonly latencyMs: number
  ) {}

  async get(): Promise<UserProfile> {
    await delay(this.latencyMs)
    const kept = openKept(this.storage, STORAGE_KEY, readProfile, {})
    return { ...DEFAULT_PROFILE, ...kept.value }
  }

  /** Throws `NotKeptError` rather than write over what it could not read. */
  async save(profile: UserProfile): Promise<UserProfile> {
    await delay(this.latencyMs)
    if (!writeKept(this.storage, STORAGE_KEY, profile, readProfile)) {
      throw new NotKeptError()
    }
    return profile
  }
}

export function createProfileRepository(
  storage: KeyedStorage = browserLocalStorage,
  latencyMs: number = MOCK_LATENCY_MS
): ProfileRepository {
  return new ProfileRepository(storage, latencyMs)
}
