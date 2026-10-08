/**
 * Where a drama lesson was left: the engine's resume point (canon Rem. 4.13),
 * which replaces the conversation's (`adapter/resume-point`) for a scene
 * tree. The engine names it in its `persist` effect, and resolves it by
 * identity on the way back in, discarding it to the root when it no longer
 * resolves (Thm. 1.1); this store only keeps it.
 *
 * In `sessionStorage`, beside the pasted tree it belongs to: a place lasts
 * exactly as long as its lesson (Rem. 7.4). One lesson at a time, like the
 * pasted slot. Every failure is silent: losing a place costs a restart.
 */

import type { StorageLike } from "@topik/lib/topik/adapter/resume-point"
import type { DramaPointStore } from "@topik/lib/topik/core/drama-runtime"

export const DRAMA_POINT_KEY = "topik:drama-point"

export type DramaPoints = DramaPointStore & {
  /** Forgets any place, whichever lesson it was in. */
  clear(): void
}

export function createDramaPointStore(
  storage: StorageLike | null
): DramaPoints {
  const write = (value: string): void => {
    try {
      storage?.setItem(DRAMA_POINT_KEY, value)
    } catch {
      // Quota, privacy mode: the place lasts this visit only.
    }
  }
  return {
    get: (lessonId): unknown => {
      try {
        const raw = storage?.getItem(DRAMA_POINT_KEY)
        if (!raw) return undefined
        const held: unknown = JSON.parse(raw)
        return typeof held === "object" &&
          held !== null &&
          "lessonId" in held &&
          held.lessonId === lessonId &&
          "point" in held
          ? held.point
          : undefined
      } catch {
        return undefined
      }
    },
    set: (lessonId, point): void => write(JSON.stringify({ lessonId, point })),
    // An empty value is "nothing held": StorageLike has no removeItem.
    clear: (): void => write(""),
  }
}
