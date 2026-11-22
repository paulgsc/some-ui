import { resumeData } from "@some-ui/resume"

import type { ResumeComposition } from "@/lib/resume-files"
import { RESUME_VERSIONS } from "@/lib/resume-files"

/**
 * The résumé's two axes as `/resume` and the LAN résumé builder offer them.
 * The order and the layouts live in `@/lib/resume-files`, which imports
 * nothing; the composition labels are résumé content and come from
 * resumeData.
 */
export type { ResumeComposition, ResumeTemplate } from "@/lib/resume-files"

export function isResumeComposition(
  value: unknown
): value is ResumeComposition {
  return RESUME_VERSIONS.some((id) => id === value)
}
export const RESUME_COMPOSITIONS: ReadonlyArray<{
  id: ResumeComposition
  label: string
}> = RESUME_VERSIONS.map((id) => ({ id, label: resumeData[id].label }))

export {
  DEFAULT_RESUME_COMPOSITION,
  DEFAULT_RESUME_TEMPLATE,
  RESUME_TEMPLATES,
  resumeStem,
} from "@/lib/resume-files"
