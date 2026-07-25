#!/usr/bin/env node
// Copies the compiled résumé PDF from @some-ui/resume's build output into
// public/, where Vite serves it as a static asset for the /resume route.
// Turbo builds @some-ui/resume first via this app's `^build` dependency, so
// the source is normally already there; running this script directly
// (bypassing turbo) just warns instead of failing the dev server.
import { copyFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const appDir = dirname(dirname(fileURLToPath(import.meta.url)))
const source = join(appDir, "../../packages/ui/resume/dist/resume.pdf")
const dest = join(appDir, "public/resume.pdf")

if (existsSync(source)) {
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(source, dest)
  // eslint-disable-next-line no-console
  console.log("[www] synced resume.pdf from @some-ui/resume")
} else {
  // eslint-disable-next-line no-console
  console.warn(
    "\n[www] packages/ui/resume/dist/resume.pdf not found - the /resume " +
      "route will 404 on its PDF until it exists. Build the source " +
      "package first:\n  pnpm --filter @some-ui/resume build\n"
  )
}
