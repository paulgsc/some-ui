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

import type { Kept, KeyedStorage } from "@some-ui/core-utils"
import {
  localStorageOrNull,
  openKept,
  readJson,
  writeKept,
} from "@some-ui/core-utils"
import type { DramaPointStore } from "@topik/lib/topik/core/drama-runtime"
import type { TopikMetadata } from "@topik/lib/topik/entity/topik-metadata"
import { TopikManifestSchema } from "@topik/lib/topik/entity/topik-metadata"
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

type HeldPoint = z.infer<typeof HeldPointSchema>

const readHeld = readJson((value): HeldPoint | null => {
  const held = HeldPointSchema.safeParse(value)
  return held.success ? held.data : null
})

/**
 * Where the served tree played last is in it, on this device: one slot,
 * keyed by the tree's id so another
 * tree starts from its opening. Unvalidated, as `DramaPointStore` says.
 */
export function createServedPointStore(
  storage: KeyedStorage | null = localStorageOrNull()
): DramaPointStore {
  const open = (): Kept<HeldPoint | null> =>
    openKept<HeldPoint | null>(storage, SERVED_DRAMA_POINT_KEY, readHeld, null)
  return {
    get: (lessonId): unknown => {
      const held = open().value
      return held?.lessonId === lessonId ? held.point : undefined
    },
    set: (lessonId, point): void => {
      // Quota, privacy mode, or a slot that could not be copied aside: the
      // place is lost, and the tree still plays.
      writeKept(storage, SERVED_DRAMA_POINT_KEY, { lessonId, point }, readHeld)
    },
  }
}
