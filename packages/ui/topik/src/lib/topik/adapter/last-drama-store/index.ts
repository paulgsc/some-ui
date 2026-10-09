/**
 * The last session's record (`core/last-drama`), kept on the device and
 * nowhere else, briefly.
 *
 * One record, the last drama played to an ending. It sits outside the belief
 * envelope (canon Rem. 4.14, 7.5): losing it costs the next prompt its "last
 * drama" section and nothing else, which is why every failure below is
 * silent. It never leaves the device (Rem. 7.3) except in a prompt the
 * learner copies.
 *
 * Kept briefly (Rem. 7.4): a record older than `LAST_DRAMA_TTL_MS` is never
 * read, and is deleted when a store is made; the review's free text is
 * removed by `forgetNext` once a prompt has carried it to the learner's
 * model.
 */

import { localStorageOrNull } from "@some-ui/core-utils"
import type { LastDramaPort } from "@topik/lib/topik/core/drama-runtime"
import type { LastDrama } from "@topik/lib/topik/core/last-drama"
import {
  ENJOYED,
  KOREAN,
  NEXT_MAX,
  withReview,
} from "@topik/lib/topik/core/last-drama"
import { z } from "zod"

export const LAST_DRAMA_KEY = "topik:last-drama"

/** Thirty days: a record older than that no longer describes the learner. */
export const LAST_DRAMA_TTL_MS = 30 * 24 * 60 * 60 * 1000

const LastDramaSchema = z.object({
  lessonId: z.string(),
  content: z.string(),
  level: z.number().int().min(1).max(6),
  title: z.string(),
  at: z.number(),
  scenes: z.array(
    z.object({ id: z.string(), place: z.string(), feeling: z.string() })
  ),
  tries: z.array(
    z.object({
      choice: z.string(),
      prompt: z.string(),
      chosen: z.string(),
      answered: z.boolean(),
    })
  ),
  review: z
    .object({
      enjoyed: z.enum(ENJOYED).optional(),
      korean: z.enum(KOREAN).optional(),
      more: z.array(z.string()).optional(),
      next: z.string().max(NEXT_MAX).optional(),
    })
    .optional(),
})

const DocumentSchema = z.object({
  version: z.literal(1),
  last: LastDramaSchema,
})

/** Which drama's free text a prompt carried, and the text. */
export type Carried = Pick<LastDrama, "lessonId" | "content"> & {
  next: string
}

/**
 * `get` is `null` when there is no record, it expired, or this build cannot
 * read it, and the same object until the record changes.
 */
export type LastDramaStore = LastDramaPort & {
  /**
   * Removes the review's free text if it is still `next`: a prompt has now
   * carried it to the learner's model (Rem. 7.4). Text the learner changed
   * since is kept.
   */
  forgetNext(carried: Carried): void
  subscribe(listener: () => void): () => void
}

export function createLastDramaStore(
  storage: Pick<
    Storage,
    "getItem" | "setItem" | "removeItem"
  > | null = localStorageOrNull(),
  now: () => number = Date.now
): LastDramaStore {
  const listeners = new Set<() => void>()
  let cached: { raw: string | null; record: LastDrama | null } = {
    raw: null,
    record: null,
  }

  const parse = (raw: string | null): LastDrama | null => {
    try {
      // A shape this build does not know is discarded, not migrated.
      const parsed = DocumentSchema.safeParse(JSON.parse(raw ?? "null"))
      return parsed.success ? parsed.data.last : null
    } catch {
      return null
    }
  }

  const read = (): LastDrama | null => {
    let raw: string | null
    try {
      raw = storage?.getItem(LAST_DRAMA_KEY) ?? null
    } catch {
      return null
    }
    if (raw !== cached.raw) cached = { raw, record: parse(raw) }
    const { record } = cached
    return record && record.at >= now() - LAST_DRAMA_TTL_MS ? record : null
  }

  const remove = (): void => {
    try {
      storage?.removeItem(LAST_DRAMA_KEY)
    } catch {
      // Privacy mode: there is nothing it could have kept.
    }
  }

  const save = (record: LastDrama): void => {
    try {
      storage?.setItem(
        LAST_DRAMA_KEY,
        JSON.stringify({ version: 1, last: record })
      )
    } catch {
      // Quota, privacy mode: a lost record is one prompt's history. The one
      // before it is another play's, so it goes too.
      remove()
    }
    for (const listener of listeners) listener()
  }

  if (read() === null) remove()

  return {
    get: read,
    save,
    forgetNext: ({ lessonId, content, next }): void => {
      const record = read()
      if (
        record?.lessonId === lessonId &&
        record.content === content &&
        record.review?.next === next
      ) {
        save(withReview(record, { next: undefined }, record.at))
      }
    },
    subscribe: (listener): (() => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
