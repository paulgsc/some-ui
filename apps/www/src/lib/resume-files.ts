/**
 * The résumé's two axes, its versions and its print layouts
 * (packages/ui/resume/README.md), and the PDF each pair is written to, with
 * no import. The build's own rules (build.paths.ts) and the public site's
 * static pages (render-public-site.ts) read it without loading
 * @some-ui/resume: vite.config.ts reads build.paths.ts, and the recording
 * stage's walk (scripts/stage-packages.ts, RI3) reads every import of that
 * config. `@/lib/resume-options` hands these out to the app.
 */

/** The versions, in the order `/resume` offers them; the first is the default. */
export const RESUME_VERSIONS = [
  "backend",
  "platform",
  "fullstack",
  "data",
  "qa",
  "solutions",
] as const
export type ResumeComposition = (typeof RESUME_VERSIONS)[number]

/** The version `/resume` opens on, and the one `resume.pdf` copies. */
export const DEFAULT_RESUME_COMPOSITION = "backend" satisfies ResumeComposition

export const RESUME_TEMPLATES = [
  { id: "rail", label: "Rail (portfolio)" },
  { id: "classic", label: "Classic (single column)" },
  { id: "compact", label: "Compact" },
  { id: "vanilla", label: "Vanilla (plain ATS)" },
  { id: "safe", label: "Safe (ATS)" },
  { id: "conventional", label: "Conventional (traditional)" },
] as const
export type ResumeTemplate = (typeof RESUME_TEMPLATES)[number]["id"]

/**
 * The print layout whose PDF keeps the plain `resume-<version>.pdf` name;
 * every other layout's PDF is `resume-<version>-<layout>.pdf`.
 */
export const DEFAULT_RESUME_TEMPLATE = "rail" satisfies ResumeTemplate

/**
 * The PDF's name, without `.pdf`, for a version in a layout. Mirrors
 * packages/ui/resume/scripts/typst.mjs's `stemFor`, since a static site has
 * no renderer to ask.
 */
export function resumeStem(
  composition: ResumeComposition,
  template: ResumeTemplate = DEFAULT_RESUME_TEMPLATE
): string {
  return template === DEFAULT_RESUME_TEMPLATE
    ? `resume-${composition}`
    : `resume-${composition}-${template}`
}
