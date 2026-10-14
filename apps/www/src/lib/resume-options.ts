import { resumeData } from "@some-ui/resume"

/**
 * The résumé's two axes as `/resume` and the LAN résumé builder offer them.
 * Order and the layout labels are presentation, so they belong here; the
 * composition labels are résumé content and come from resumeData.
 */
const RESUME_ORDER = ["backend", "platform", "fullstack"] as const
export type ResumeComposition = (typeof RESUME_ORDER)[number]
export const RESUME_COMPOSITIONS: ReadonlyArray<{
  id: ResumeComposition
  label: string
}> = RESUME_ORDER.map((id) => ({ id, label: resumeData[id].label }))

/** The layout axis (packages/ui/resume/README.md, Templates). */
export const RESUME_TEMPLATES = [
  { id: "rail", label: "Rail (portfolio)" },
  { id: "classic", label: "Classic (single column)" },
  { id: "compact", label: "Compact" },
  { id: "vanilla", label: "Vanilla (plain ATS)" },
  { id: "safe", label: "Safe (ATS)" },
  { id: "conventional", label: "Conventional (traditional)" },
] as const
