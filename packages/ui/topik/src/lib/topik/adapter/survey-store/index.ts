/**
 * The learner's lesson surveys, kept on the device and nowhere else, briefly.
 *
 * An evaluation report sits outside the belief envelope (adaptive-learning
 * canon Cor. 3.4), like the resume point beside it. Losing one costs that
 * report and nothing else, which is why every failure below is silent:
 * eviction, a full quota, a private window, a document an older build wrote.
 * It never leaves the device (Rem. 7.3). Its readers are selection, which
 * orders the served lessons (Rem. 3.5), and, on the learner's opt-in path,
 * the digest they hand their own model.
 *
 * Kept briefly (Rem. 7.4):
 * - at most MAX_SURVEYS reports, the most recent;
 * - none older than SURVEY_TTL_MS, dropped whenever the store is read or
 *   written, so an expired report is never read even if nothing was written
 *   since;
 * - a report's free text (`becoming`) is removed by `forgetBecoming` once a
 *   prompt has carried it to the learner's model.
 */

import type { StorageLike } from "@topik/lib/topik/adapter/resume-point"
import type {
  LessonSurvey,
  SurveyReport,
} from "@topik/lib/topik/core/lesson-survey"
import {
  DIFFICULTY,
  ENTHUSIASM,
  isBlank,
  MAX_BECOMING_LENGTH,
  WORTHWHILE,
} from "@topik/lib/topik/core/lesson-survey"
import { z } from "zod"

export const SURVEY_STORAGE_KEY = "topik:lesson-surveys"

/** Recent reports only: selection reads the last few, a digest the last five. */
export const MAX_SURVEYS = 10

/** Thirty days: a report older than that no longer describes the learner. */
export const SURVEY_TTL_MS = 30 * 24 * 60 * 60 * 1000

const SurveyItemSchema = z.object({
  batchId: z.number(),
  probeId: z.string(),
  source: z.string().optional(),
  prompt: z.string().optional(),
  relations: z.array(z.string()).optional(),
})

const SurveyDocumentSchema = z.object({
  version: z.literal(1),
  reports: z.array(
    z.object({
      topikKey: z.string(),
      at: z.number(),
      worthwhile: z.enum(WORTHWHILE).optional(),
      enthusiasm: z.enum(ENTHUSIASM).optional(),
      difficulty: z.enum(DIFFICULTY).optional(),
      displayName: z.string().optional(),
      level: z.number().int().min(1).max(6).optional(),
      stuck: z.array(SurveyItemSchema),
      flagged: z.array(SurveyItemSchema).optional(),
      becoming: z.string().optional(),
    })
  ),
})

export type SurveyStore = {
  /** Keeps a report; a blank one is a skip and is not kept. */
  add(
    topikKey: string,
    survey: LessonSurvey,
    lesson?: { displayName?: string; level?: number }
  ): void
  /** Newest first; never older than SURVEY_TTL_MS. */
  list(): Array<SurveyReport>
  /**
   * Removes the free text of exactly these reports, by lesson and moment: a
   * prompt has now carried it to the learner's model, and it has said what
   * it had to say. Named rather than counted, because the store can change
   * between building a prompt and handing it off - another tab can add a
   * report - and the newest `n` then are not the ones carried.
   */
  forgetBecoming(carried: Array<Pick<SurveyReport, "topikKey" | "at">>): void
}

/** `window.localStorage`, or null wherever touching it throws. */
function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

export function createSurveyStore(
  storage: StorageLike | null = defaultStorage(),
  now: () => number = Date.now
): SurveyStore {
  // Each operation reads the clock once: one add, one moment.
  const fresh = (
    reports: Array<SurveyReport>,
    at: number
  ): Array<SurveyReport> =>
    reports
      .filter((report) => report.at >= at - SURVEY_TTL_MS)
      .slice(0, MAX_SURVEYS)

  const write = (reports: Array<SurveyReport>, at: number): void => {
    try {
      storage?.setItem(
        SURVEY_STORAGE_KEY,
        JSON.stringify({ version: 1, reports: fresh(reports, at) })
      )
    } catch {
      // Quota, privacy mode: a lost report is one report, nothing more.
    }
  }

  const read = (at: number): Array<SurveyReport> => {
    try {
      const raw = storage?.getItem(SURVEY_STORAGE_KEY)
      if (!raw) return []
      const parsed = SurveyDocumentSchema.safeParse(JSON.parse(raw))
      // A shape this build does not know is discarded, not migrated.
      if (!parsed.success) return []
      const kept = fresh(parsed.data.reports, at)
      // What a read drops is deleted, not just hidden: an expired report's
      // free text and evidence would otherwise stay on the device until the
      // next survey happened to rewrite it.
      if (kept.length < parsed.data.reports.length) write(kept, at)
      return kept
    } catch {
      return []
    }
  }

  return {
    add: (topikKey, survey, lesson): void => {
      if (isBlank(survey)) return
      const at = now()
      const becoming = survey.becoming?.trim().slice(0, MAX_BECOMING_LENGTH)
      const report: SurveyReport = {
        topikKey,
        ...(lesson?.displayName ? { displayName: lesson.displayName } : {}),
        ...(lesson?.level ? { level: lesson.level } : {}),
        at,
        ...(survey.worthwhile ? { worthwhile: survey.worthwhile } : {}),
        ...(survey.enthusiasm ? { enthusiasm: survey.enthusiasm } : {}),
        ...(survey.difficulty ? { difficulty: survey.difficulty } : {}),
        stuck: survey.stuck,
        ...(survey.flagged?.length ? { flagged: survey.flagged } : {}),
        ...(becoming ? { becoming } : {}),
      }
      write([report, ...read(at)], at)
    },

    list: (): Array<SurveyReport> => read(now()),

    forgetBecoming: (carried): void => {
      const at = now()
      const reports = read(at)
      const isCarried = (report: SurveyReport): boolean =>
        carried.some(
          (item) => item.topikKey === report.topikKey && item.at === report.at
        )
      if (!reports.some((report) => report.becoming && isCarried(report))) {
        return
      }
      write(
        reports.map((report) => {
          if (!isCarried(report)) return report
          const { becoming: _carried, ...rest } = report
          return rest
        }),
        at
      )
    },
  }
}
