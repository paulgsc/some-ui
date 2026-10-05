import type { StorageLike } from "@topik/lib/topik/adapter/resume-point"

/** An in-memory `StorageLike`, its backing map exposed for assertions. */
export const memoryStorage = (): StorageLike & {
  map: Map<string, string>
} => {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key: string): string | null => map.get(key) ?? null,
    setItem: (key: string, value: string): void => void map.set(key, value),
  }
}
