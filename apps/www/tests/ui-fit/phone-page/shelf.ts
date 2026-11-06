/**
 * The account's shelf (`ShelfPort`, `@some-ui/shared`) in this page load's
 * memory, for the fixtures that draw a keep or a kept list.
 */
import type { ShelfItem, ShelfPort } from "@some-ui/shared"

/** How the shelf answers a keep: `kept`, or why it refuses, as its client says it (`reason`). */
export type ShelfAnswer = "kept" | "full" | "signed-out" | "invalid" | "failed"

const keeps = (): ShelfAnswer => "kept"

/**
 * A shelf holding `seed` (key and body) before the walk began, which answers
 * each keep as `answer` says at that moment.
 */
export function memoryShelf({
  seed = [],
  answer = keeps,
}: {
  seed?: ReadonlyArray<readonly [string, string]>
  answer?: () => ShelfAnswer
} = {}): ShelfPort {
  const bodies = new Map<string, string>(seed)
  const item = (key: string): ShelfItem => ({
    key,
    contentHash: "0".repeat(64),
    savedAt: "2026-11-01T09:00:00.000Z",
  })
  return {
    list: (): ReturnType<ShelfPort["list"]> =>
      Promise.resolve({ items: [...bodies.keys()].map(item), cap: 20 }),
    read: (key): Promise<unknown> => {
      const body = bodies.get(key)
      if (body === undefined) return Promise.reject(new Error("not kept"))
      const parsed: unknown = JSON.parse(body)
      return Promise.resolve(parsed)
    },
    keep: (key, body): ReturnType<ShelfPort["keep"]> => {
      const now = answer()
      if (now !== "kept") {
        return Promise.reject(Object.assign(new Error(now), { reason: now }))
      }
      const had = bodies.get(key)
      bodies.set(key, body)
      return Promise.resolve({
        change:
          had === undefined ? "kept" : had === body ? "unchanged" : "replaced",
        item: item(key),
      })
    },
    remove: (key): Promise<void> => {
      bodies.delete(key)
      return Promise.resolve()
    },
  }
}
