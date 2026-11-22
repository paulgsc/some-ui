/**
 * The résumé's print layouts (packages/ui/resume/README.md, Templates), with
 * no import, so the build's own rules (build.paths.ts) can name their PDFs
 * without loading @some-ui/resume: vite.config.ts reads build.paths.ts, and
 * the recording stage's walk (scripts/stage-packages.ts, RI3) reads every
 * import of that config. `@/lib/resume-options` hands these out to the app.
 */
export const RESUME_TEMPLATES = [
  { id: "rail", label: "Rail (portfolio)" },
  { id: "classic", label: "Classic (single column)" },
  { id: "compact", label: "Compact" },
  { id: "vanilla", label: "Vanilla (plain ATS)" },
  { id: "safe", label: "Safe (ATS)" },
  { id: "conventional", label: "Conventional (traditional)" },
] as const

/**
 * The print layout whose PDF keeps the plain `resume-<version>.pdf` name
 * (packages/ui/resume/scripts/typst.mjs, `stemFor`); every other layout's
 * PDF is `resume-<version>-<layout>.pdf`.
 */
export const DEFAULT_RESUME_TEMPLATE =
  "rail" satisfies (typeof RESUME_TEMPLATES)[number]["id"]
