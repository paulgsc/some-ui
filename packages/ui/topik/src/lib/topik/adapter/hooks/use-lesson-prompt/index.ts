/**
 * The handheld's prompt for the learner's own model (canon Cor. 8.2, 8.3),
 * and the level the learner holds.
 *
 * The prompt is the tree prompt, carrying a digest of the evaluation reports
 * still on the device (`adapter/survey-store`). The level is the learner's to
 * choose; until they do, it is the level of the last report that named one.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { SurveyStore } from "@topik/lib/topik/adapter/survey-store"
import { createSurveyStore } from "@topik/lib/topik/adapter/survey-store"
import { heldLevel } from "@topik/lib/topik/core/lesson-selection"
import type { SurveyReport } from "@topik/lib/topik/core/lesson-survey"
import type { LessonRequest } from "@topik/lib/topik/generation"
import {
  buildTreePrompt,
  DIGEST_LESSONS,
  surveyDigest,
} from "@topik/lib/topik/generation"

export type LessonPrompt = {
  /** The level the learner holds: read-aloud's, and the prompt's default. */
  level: number
  /** The learner moving to another level; a report never does. */
  chooseLevel: (level: number) => void
  /** The tree prompt for this request, with the reports' digest. */
  prompt: (request: Omit<LessonRequest, "survey">) => string
  /**
   * The prompt reached the learner - the clipboard took it, or they copied
   * it by hand - so the digest's free text is deleted: the prompt carried
   * it (canon Rem. 7.4). Not before, or a refused clipboard would lose it
   * unsent.
   */
  handedOff: (prompt: string) => void
}

export function useLessonPrompt(surveyStore?: SurveyStore): LessonPrompt {
  const [surveys] = useState(() => surveyStore ?? createSurveyStore())
  // Re-read whenever the learner comes back to the tab: a report expires by
  // the clock, and a tab left open for days would otherwise keep it.
  const [reports, setReports] = useState(() => surveys.list())
  useEffect(() => {
    const refresh = (): void => {
      if (document.visibilityState === "visible") setReports(surveys.list())
    }
    document.addEventListener("visibilitychange", refresh)
    return (): void => document.removeEventListener("visibilitychange", refresh)
  }, [surveys])

  const [chosenLevel, setChosenLevel] = useState<number | null>(null)

  // Each prompt built, and the reports its digest was made from. A handoff
  // names the prompt it handed off, so it forgets what that prompt carried
  // and nothing else - not the reports of a later prompt, built while an
  // earlier one was still on screen to copy.
  const carried = useRef(new Map<string, Array<SurveyReport>>())

  const prompt = useCallback(
    (request: Omit<LessonRequest, "survey">): string => {
      const digest = surveys.list().slice(0, DIGEST_LESSONS)
      const text = buildTreePrompt({
        ...request,
        survey: surveyDigest(digest, DIGEST_LESSONS),
      })
      carried.current.set(text, digest)
      return text
    },
    [surveys]
  )

  const handedOff = useCallback(
    (text: string): void => {
      const digest = carried.current.get(text)
      if (!digest) return
      carried.current.delete(text)
      surveys.forgetBecoming(digest)
      setReports(surveys.list())
    },
    [surveys]
  )

  return {
    level: chosenLevel ?? heldLevel(reports),
    chooseLevel: setChosenLevel,
    prompt,
    handedOff,
  }
}
