/**
 * The phone's feed of served scene trees: the operator's reviewed batch,
 * which the lesson CRM checks with both audits and saves under
 * `TREE_ACTIVITY` (docs/makjang/README.md, "Increments" M2; MKJ-S4).
 *
 * It sits beside the conversation batch rather than in it. The server lists
 * one activity per manifest (`?activity=`), and the desktop session reads
 * only the conversation one, so it never lists a tree; only the handheld
 * reads this feed. A served tree is stored already checked, and is checked
 * again here on the way to the learner (`intakeTree`, MK4), exactly as a
 * pasted one is on its way out of storage (`adapter/pasted-lesson`).
 */

import { localStorageOrNull } from "@some-ui/core-utils"
import type { TopikMetadata } from "@topik/lib/topik"
import { TopikManifestSchema } from "@topik/lib/topik"
import type { StorageLike } from "@topik/lib/topik/adapter/storage"
import type { DramaPointStore } from "@topik/lib/topik/core/drama-runtime"
import type { TreeIntake } from "@topik/lib/topik/generation/tree-intake"
import { intakeTree } from "@topik/lib/topik/generation/tree-intake"
import { z } from "zod"

/** The curriculum activity served scene trees are saved and listed under. */
export const TREE_ACTIVITY = "makjang"

export type TreeFeed = {
  /** The trees served this week: their manifest entries. */
  list(): Promise<Array<TopikMetadata>>
  /** One served tree, through both audits. */
  load(key: string): Promise<TreeIntake>
}

/**
 * The feed over the host's loaders: `loadManifest` answers the
 * `TREE_ACTIVITY` manifest, and `loadTree` a lesson body by key (the same
 * route conversation lessons load from).
 */
export function createTreeFeed(
  loadManifest: () => Promise<unknown>,
  loadTree: (key: string) => Promise<unknown>
): TreeFeed {
  return {
    list: async () => TopikManifestSchema.parse(await loadManifest()).topiks,
    load: async (key) => intakeTree(JSON.stringify(await loadTree(key))),
  }
}

/**
 * The place store for the served tree listed under `key`. A tree's id is the
 * model's, and the operator can save one tree under two keys: each listing
 * keeps its own place.
 */
export const pointsFor = (
  store: DramaPointStore,
  key: string
): DramaPointStore => ({
  get: (lessonId) => store.get(`${key}/${lessonId}`),
  set: (lessonId, point) => store.set(`${key}/${lessonId}`, point),
})

export const SERVED_DRAMA_POINT_KEY = "topik:served-drama-point"

const HeldPointSchema = z.object({ lessonId: z.string(), point: z.unknown() })

/**
 * Where the served tree played last is in it, on this device: one slot, like
 * the conversation lessons' resume point, keyed by the tree's id so another
 * tree starts from its opening. Unvalidated, as `DramaPointStore` says.
 */
export function createServedPointStore(
  storage: StorageLike | null = localStorageOrNull()
): DramaPointStore {
  return {
    get: (lessonId): unknown => {
      try {
        const raw = storage?.getItem(SERVED_DRAMA_POINT_KEY)
        const held = HeldPointSchema.safeParse(raw ? JSON.parse(raw) : null)
        return held.success && held.data.lessonId === lessonId
          ? held.data.point
          : undefined
      } catch {
        return undefined
      }
    },
    set: (lessonId, point): void => {
      try {
        storage?.setItem(
          SERVED_DRAMA_POINT_KEY,
          JSON.stringify({ lessonId, point })
        )
      } catch {
        // Quota, privacy mode: the place is lost, and the tree still plays.
      }
    },
  }
}
