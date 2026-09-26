/**
 * The learner's lesson surveys, kept on the device until a server takes them.
 *
 * An evaluation report sits outside the belief envelope (adaptive-learning
 * canon Cor. 3.4), like the resume point beside it: losing one costs that
 * report and nothing else, which is what makes every failure below silent -
 * eviction, a full quota, a private window, a document an older build wrote.
 * Local is the first home, not the last: the generator that reads these runs
 * elsewhere, and a `file_host` route for them is the follow-up.
 */

import type { StorageLike } from "@topik/lib/topik/adapter/resume-point"
import type { LessonSurvey } from "@topik/lib/topik/core/lesson-survey"
import {
  DIFFICULTY,
  ENTHUSIASM,
  isBlank,
  MAX_BECOMING_LENGTH,
  WORTHWHILE,
} from "@topik/lib/topik/core/lesson-survey"
import { z } from "zod"

export const SURVEY_STORAGE_KEY = "topik:lesson-surveys"

/** Oldest reports are dropped first; a digest reads the recent ones. */
export const MAX_SURVEYS = 50

export type SurveyReport = LessonSurvey & {
  topikKey: string
  /** Epoch ms. */
  at: number
}

const SurveyDocumentSchema = z.object({
  version: z.literal(1),
  reports: z.array(
    z.object({
      topikKey: z.string(),
      at: z.number(),
      worthwhile: z.enum(WORTHWHILE).optional(),
      enthusiasm: z.enum(ENTHUSIASM).optional(),
      difficulty: z.enum(DIFFICULTY).optional(),
      stuck: z.array(z.object({ batchId: z.number(), probeId: z.string() })),
      becoming: z.string().optional(),
    })
  ),
})

type SurveyDocument = z.infer<typeof SurveyDocumentSchema>

export type SurveyStore = {
  /** Keeps a report; a blank one is a skip and is not kept. */
  add(topikKey: string, survey: LessonSurvey): void
  /** Newest first. */
  list(): Array<SurveyReport>
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
  const read = (): SurveyDocument => {
    try {
      const raw = storage?.getItem(SURVEY_STORAGE_KEY)
      if (!raw) return { version: 1, reports: [] }
      const parsed = SurveyDocumentSchema.safeParse(JSON.parse(raw))
      // A shape this build does not know is discarded, not migrated.
      return parsed.success ? parsed.data : { version: 1, reports: [] }
    } catch {
      return { version: 1, reports: [] }
    }
  }

  return {
    add: (topikKey, survey): void => {
      if (isBlank(survey)) return
      const becoming = survey.becoming?.trim().slice(0, MAX_BECOMING_LENGTH)
      const report: SurveyReport = {
        topikKey,
        at: now(),
        ...(survey.worthwhile ? { worthwhile: survey.worthwhile } : {}),
        ...(survey.enthusiasm ? { enthusiasm: survey.enthusiasm } : {}),
        ...(survey.difficulty ? { difficulty: survey.difficulty } : {}),
        stuck: survey.stuck,
        ...(becoming ? { becoming } : {}),
      }
      const doc = read()
      const reports = [report, ...doc.reports].slice(0, MAX_SURVEYS)
      try {
        storage?.setItem(
          SURVEY_STORAGE_KEY,
          JSON.stringify({ version: 1, reports })
        )
      } catch {
        // Quota, privacy mode: a lost report is one report, nothing more.
      }
    },

    list: (): Array<SurveyReport> => read().reports,
  }
}
