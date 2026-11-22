import { resumeData } from "@some-ui/resume"

/**
 * The résumé's two axes as `/resume` and the LAN résumé builder offer them.
 * Order and the layout labels are presentation, so they belong here; the
 * composition labels are résumé content and come from resumeData.
 */
const RESUME_ORDER = [
  "backend",
  "platform",
  "fullstack",
  "data",
  "qa",
  "solutions",
] as const
export type ResumeComposition = (typeof RESUME_ORDER)[number]

export function isResumeComposition(
  value: unknown
): value is ResumeComposition {
  return RESUME_ORDER.some((id) => id === value)
}
export const RESUME_COMPOSITIONS: ReadonlyArray<{
  id: ResumeComposition
  label: string
}> = RESUME_ORDER.map((id) => ({ id, label: resumeData[id].label }))

// The layout axis lives in ./resume-templates.ts, which imports nothing, so
// build.paths.ts can read it without reaching the résumé's package (the
// recording stage's walk reads build.paths.ts through vite.config.ts, RI3).
export {
  DEFAULT_RESUME_TEMPLATE,
  RESUME_TEMPLATES,
} from "@/lib/resume-templates"
