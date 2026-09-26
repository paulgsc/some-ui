/**
 * Where a handheld lesson was left, so a phone call does not cost the lesson.
 *
 * A place in content, never a competence claim (adaptive-learning canon
 * Cor. 4.4 (iii)): it sits outside the belief envelope, and losing it costs a
 * restart and nothing else. That is what makes every failure below silent -
 * eviction, a full quota, a private window, a document written by an older
 * build (Thm. 7.2, Prop. 7.2).
 *
 * The line is stored by message *id* and resolved by identity on read, so a
 * revised topik file cannot resume into the wrong line; an id that no longer
 * resolves means the conversation's start (Thm. 1.1).
 */

import { z } from "zod"

export const RESUME_STORAGE_KEY = "topik:handheld-resume"

/** How many topiks remember a place. Oldest is forgotten first. */
export const MAX_RESUME_POINTS = 12

export type ResumePoint = {
  conversation: number
  messageId: string
  /** Epoch ms of the last write; orders eviction. */
  at: number
}

const ResumeDocumentSchema = z.object({
  version: z.literal(1),
  last: z.string().nullable(),
  points: z.record(
    z.string(),
    z.object({
      conversation: z.number().int().nonnegative(),
      messageId: z.string(),
      at: z.number(),
    })
  ),
})

type ResumeDocument = z.infer<typeof ResumeDocumentSchema>

const EMPTY: ResumeDocument = { version: 1, last: null, points: {} }

export type ResumeStore = {
  get(topikKey: string): ResumePoint | null
  /** The topik most recently written, if its point is still held. */
  last(): { topikKey: string; point: ResumePoint } | null
  set(topikKey: string, point: Omit<ResumePoint, "at">): void
  clear(topikKey: string): void
}

export type StorageLike = Pick<Storage, "getItem" | "setItem">

/** `window.localStorage`, or null wherever touching it throws. */
function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

export function createResumeStore(
  storage: StorageLike | null = defaultStorage(),
  now: () => number = Date.now
): ResumeStore {
  const read = (): ResumeDocument => {
    try {
      const raw = storage?.getItem(RESUME_STORAGE_KEY)
      if (!raw) return EMPTY
      const parsed = ResumeDocumentSchema.safeParse(JSON.parse(raw))
      // A shape this build does not know is discarded, not migrated: there is
      // nothing in it worth a migration (Thm. 7.3's terminal case).
      return parsed.success ? parsed.data : EMPTY
    } catch {
      return EMPTY
    }
  }

  const write = (doc: ResumeDocument): void => {
    try {
      storage?.setItem(RESUME_STORAGE_KEY, JSON.stringify(doc))
    } catch {
      // Quota, privacy mode: a lost resume point is a restart, nothing more.
    }
  }

  return {
    get: (topikKey): ResumePoint | null => read().points[topikKey] ?? null,

    last: (): { topikKey: string; point: ResumePoint } | null => {
      const doc = read()
      const point = doc.last === null ? undefined : doc.points[doc.last]
      return doc.last !== null && point ? { topikKey: doc.last, point } : null
    },

    set: (topikKey, point): void => {
      const doc = read()
      const points = { ...doc.points, [topikKey]: { ...point, at: now() } }
      const kept = Object.entries(points)
        .sort(([, a], [, b]) => b.at - a.at)
        .slice(0, MAX_RESUME_POINTS)
      write({ version: 1, last: topikKey, points: Object.fromEntries(kept) })
    },

    clear: (topikKey): void => {
      const doc = read()
      if (!(topikKey in doc.points)) return
      const { [topikKey]: _dropped, ...points } = doc.points
      write({
        version: 1,
        last: doc.last === topikKey ? null : doc.last,
        points,
      })
    },
  }
}
