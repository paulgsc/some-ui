import {
  PersistedSnapshotSchema,
  type PersistedSnapshot,
} from "@interview/lib/interview/core/interview-types"

const STORAGE_KEY = "some-ui:mock-interview:session"

export const readPersistedSession = (): PersistedSnapshot | null => {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return PersistedSnapshotSchema.parse(JSON.parse(raw))
  } catch {
    return null
  }
}

export const writePersistedSession = (snapshot: PersistedSnapshot): void => {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Storage may be full or unavailable (private browsing) - practice
    // continues without persistence, no need to surface this to the user.
  }
}

export const clearPersistedSession = (): void => {
  if (typeof window === "undefined") return

  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // no-op
  }
}
