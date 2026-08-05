import type { JSX } from "react"

import { useStudyNudge } from "@/lib/study-nudge/use-study-nudge"

/**
 * Renders nothing; exists so the nudge timer is mounted once for the whole
 * app rather than by whichever route happens to be on screen. It has to sit
 * inside `QueryProvider` — the policy reads the sessions and settings
 * queries — and outside any route, since the entire point is that it keeps
 * watching while you are looking at something else.
 */
export const StudyNudgeWatcher = (): JSX.Element | null => {
  useStudyNudge()
  return null
}
