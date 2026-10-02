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

import type { SurveyItem } from "@topik/lib/topik/core/lesson-survey"
import { z } from "zod"

export const RESUME_STORAGE_KEY = "topik:handheld-resume"

/** How many topiks remember a place. Oldest is forgotten first. */
export const MAX_RESUME_POINTS = 12

/**
 * The conversation's check results so far, keyed as the lesson keys them.
 * Without them a resumed conversation would re-ask what was answered and lose
 * the misses it promised to revisit - a tally that is wrong, not just short.
 * Still not a competence claim: it is this conversation's score sheet, it is
 * discarded with the point, and restoring it drops any key the content no
 * longer has (Thm. 1.1).
 */
type ResumeOutcomes = {
  firstTry: Record<string, boolean>
  review: Array<string>
  /** Repeats already answered, so a reload does not serve them again. */
  reviewed?: Array<string>
}

/**
 * What the end-of-lesson survey will offer, gathered so far: the probes
 * missed on first presentation in every conversation (by conversation id),
 * and the answers flagged as keyed wrong (canon Cor. 3.4, Rem. 3.4). The
 * outcomes above only cover the current conversation, so without this a
 * learner who leaves and comes back would be surveyed on half a lesson.
 * Like the outcomes, it goes with the point when the lesson finishes.
 */
type ResumeSurveyEvidence = {
  /** Pinned to the probe version missed, `id@fp` (`pinMisses`). */
  missed: Record<number, Array<string>>
  flagged: Array<SurveyItem>
}

type ResumePoint = {
  /**
   * The conversation's authored id - what it is. `conversation` is only where
   * it was, and a file that inserts or reorders conversations moves it
   * (Thm. 1.1). A point without an id is not resumed.
   */
  batchId?: number
  conversation: number
  messageId: string
  outcomes?: ResumeOutcomes
  survey?: ResumeSurveyEvidence
  /** Epoch ms of the last write; orders eviction. */
  at: number
}

const ResumeDocumentSchema = z.object({
  version: z.literal(1),
  last: z.string().nullable(),
  points: z.record(
    z.string(),
    z.object({
      batchId: z.number().optional(),
      conversation: z.number().int().nonnegative(),
      messageId: z.string(),
      // Optional: points written before outcomes were kept still resume.
      outcomes: z
        .object({
          firstTry: z.record(z.string(), z.boolean()),
          review: z.array(z.string()),
          reviewed: z.array(z.string()).optional(),
        })
        .optional(),
      // Optional: points written before the survey's evidence was kept.
      survey: z
        .object({
          missed: z.record(z.coerce.number(), z.array(z.string())),
          flagged: z.array(
            z.object({
              batchId: z.number(),
              probeId: z.string(),
              source: z.string().optional(),
              prompt: z.string().optional(),
            })
          ),
        })
        .optional(),
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
  /**
   * Drops every point whose topik key matches. If `last` was among them, the
   * most recent point left becomes `last`, so "Continue" still offers a
   * lesson that is there.
   */
  clearWhere(matches: (topikKey: string) => boolean): void
}

export type StorageLike = Pick<Storage, "getItem" | "setItem">

/** `window.localStorage`, or null wherever touching it throws. */
function defaultStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

export function createResumeStore(
  storage:
    | (StorageLike & Partial<Pick<Storage, "removeItem">>)
    | null = defaultStorage(),
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

  /** False when storage refused the write. */
  const write = (doc: ResumeDocument): boolean => {
    try {
      storage?.setItem(RESUME_STORAGE_KEY, JSON.stringify(doc))
      return true
    } catch {
      // Quota, privacy mode: a lost resume point is a restart, nothing more.
      return false
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

    clearWhere: (matches): void => {
      const doc = read()
      const kept = Object.entries(doc.points).filter(([key]) => !matches(key))
      if (kept.length === Object.keys(doc.points).length) return
      const lastKept =
        doc.last !== null && !matches(doc.last)
          ? doc.last
          : ([...kept].sort(([, a], [, b]) => b.at - a.at)[0]?.[0] ?? null)
      const written = write({
        version: 1,
        last: lastKept,
        points: Object.fromEntries(kept),
      })
      // What a purge drops must go even when storage refuses the rewrite
      // but still reads: the whole document is removed, and the points it
      // would have kept go with it - a restart, not retained data (Codex,
      // #1555).
      if (!written) {
        try {
          storage?.removeItem?.(RESUME_STORAGE_KEY)
        } catch {
          // Refuses that too; there is nothing further to try.
        }
      }
    },
  }
}
