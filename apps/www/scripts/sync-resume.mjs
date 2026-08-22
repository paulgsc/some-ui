#!/usr/bin/env node
// Copies the compiled résumé PDFs from @some-ui/resume's build output into
// public/, where Vite serves them for the /resume route.
//
// PDFs only. The SVG previews used to be copied too, as a mobile fallback for
// the fact that no mobile browser renders a PDF inline. That fallback is gone:
// Typst's SVG export contains no text — every glyph is a path — so it was an
// image of a résumé, 1.1 MB each, needing a hand-written transcript beside it
// for anyone who could not see it. The /resume route now renders
// @some-ui/resume's ResumeDocument from exported data instead, which is real
// text at a fraction of the size. The SVGs are still built (they are useful
// for visual diffing) but no longer shipped to the site.
// Turbo builds @some-ui/resume first via this app's `^build` dependency, so
// the source is normally already there; running this script directly
// (bypassing turbo) just warns instead of failing the dev server.
import { copyFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const appDir = dirname(dirname(fileURLToPath(import.meta.url)))
const resumeDir = join(appDir, "../../packages/ui/resume/documents")
const publicDir = join(appDir, "public")
const files = [
  "resume.pdf",
  "resume-backend.pdf",
  "resume-systems.pdf",
  "resume-learning.pdf",
]

if (files.every((file) => existsSync(join(resumeDir, file)))) {
  mkdirSync(publicDir, { recursive: true })
  for (const file of files) {
    copyFileSync(join(resumeDir, file), join(publicDir, file))
  }
  // eslint-disable-next-line no-console
  console.log("[www] synced résumé compositions from @some-ui/resume")
} else {
  // eslint-disable-next-line no-console
  console.warn(
    "\n[www] compiled résumé PDFs not found - the /resume route's download " +
      "and desktop preview will 404 until they exist. Build the source " +
      "package first:\n  pnpm --filter @some-ui/resume build\n"
  )
}
