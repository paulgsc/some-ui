/**
 * The résumé's *layout* axis, independent of composition
 * (packages/ui/resume/README.md, Templates), as `/resume` and the LAN
 * résumé builder offer it. Labels are UI copy, so they belong here, not
 * in @some-ui/resume.
 */
export const RESUME_TEMPLATES = [
  { id: "rail", label: "Rail (portfolio)" },
  { id: "classic", label: "Classic (single column)" },
  { id: "compact", label: "Compact" },
  { id: "vanilla", label: "Vanilla (plain ATS)" },
  { id: "safe", label: "Safe (ATS)" },
  { id: "conventional", label: "Conventional (traditional)" },
] as const
