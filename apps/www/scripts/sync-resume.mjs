#!/usr/bin/env node
// Copies the compiled résumé PDFs and SVG previews from @some-ui/resume's
// build output into public/, where Vite serves them for the /resume route.
// Turbo builds @some-ui/resume first via this app's `^build` dependency, so
// the source is normally already there; running this script directly
// (bypassing turbo) just warns instead of failing the dev server.
import { copyFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const appDir = dirname(dirname(fileURLToPath(import.meta.url)))
const resumeDir = join(appDir, "../../packages/ui/resume/dist")
const publicDir = join(appDir, "public")
const files = [
  "resume.pdf",
  "resume-backend.pdf",
  "resume-backend.svg",
  "resume-systems.pdf",
  "resume-systems.svg",
  "resume-learning.pdf",
  "resume-learning.svg",
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
    "\n[www] compiled résumé assets not found - the /resume " +
      "route will 404 on its previews until they exist. Build the source " +
      "package first:\n  pnpm --filter @some-ui/resume build\n"
  )
}
