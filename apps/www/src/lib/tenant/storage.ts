/**
 * Minimal storage seam so repositories can be exercised in tests with an
 * in-memory fake instead of the real `window.localStorage`.
 */
export type StorageAdapter = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export const browserLocalStorage: StorageAdapter = {
  getItem: (key) =>
    typeof window === "undefined" ? null : window.localStorage.getItem(key),
  setItem: (key, value) => {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value)
  },
  removeItem: (key) => {
    if (typeof window !== "undefined") window.localStorage.removeItem(key)
  },
}

export function createInMemoryStorage(): StorageAdapter {
  const store = new Map<string, string>()
  return {
    getItem: (key): string | null => store.get(key) ?? null,
    setItem: (key, value): void => {
      store.set(key, value)
    },
    removeItem: (key): void => {
      store.delete(key)
    },
  }
}

/** Default simulated network latency for the mock tenant repositories. */
export const MOCK_LATENCY_MS = 150

export function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function readJSON<T>(
  storage: StorageAdapter,
  key: string,
  fallback: T
): T {
  const raw = storage.getItem(key)
  if (!raw) return fallback
  try {
    const parsed: T = JSON.parse(raw)
    return parsed
  } catch {
    return fallback
  }
}

export function writeJSON(
  storage: StorageAdapter,
  key: string,
  value: unknown
): void {
  storage.setItem(key, JSON.stringify(value))
}

export function generateId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
