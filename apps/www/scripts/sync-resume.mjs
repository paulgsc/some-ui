#!/usr/bin/env node
// Copies the compiled résumé documents from @some-ui/resume's build output
// into public/, where Vite serves them: the PDFs for the /resume route, and
// the Markdown/JSON Resume files and llms.txt that let an agent read the
// résumé, with each claim's evidence, without running the SPA. No SVGs:
// phones get the route's HTML ResumeDocument, not an image.
//
// Turbo builds @some-ui/resume first (`^build`); run directly, missing PDFs
// only warn, but a missing *module* build fails at once (see below).
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const appDir = dirname(dirname(fileURLToPath(import.meta.url)))
const resumeDir = join(appDir, "../../packages/ui/resume/documents")
const publicDir = join(appDir, "public")

// `compile.mjs` writes documents/manifest.json listing exactly the PDFs that
// compile produced (every composition x template, plus the `resume.pdf`
// alias), and `export-data.mjs` adds the agent-readable documents to it. Reading it avoids a hard-coded list that drifts on every rename,
// and a cross-package import (a banned `../` path, or an `exports` subpath
// @some-ui/vite-config's build overwrites).
//
// The full set is required: the template picker links to every one, and a
// partial `documents/` would ship a picker whose other options 404.
function expectedResumePdfs() {
  const manifestPath = join(resumeDir, "manifest.json")
  if (!existsSync(manifestPath)) return null
  return JSON.parse(readFileSync(manifestPath, "utf8"))
}

// #1453: `resume.tsx` imports @some-ui/resume as a module; without its built
// JS, `vite build` dies in Rolldown with a trace that never says "not built".
// Fail at once, naming the package and command, read from its own manifest.
const resumePackageDir = join(appDir, "../../packages/ui/resume")
const resumeEntry = join(
  resumePackageDir,
  JSON.parse(readFileSync(join(resumePackageDir, "package.json"), "utf8"))
    .module
)
if (!existsSync(resumeEntry)) {
  // eslint-disable-next-line no-console
  console.error(
    "[www] @some-ui/resume is not built - its module entry " +
      `${resumeEntry} does not exist, and /resume imports it. Build it ` +
      "first: pnpm --filter @some-ui/resume build"
  )
  process.exitCode = 1
} else {
  syncResumePdfs()
}

function syncResumePdfs() {
  const expected = expectedResumePdfs()
  const missing =
    expected === null
      ? null
      : expected.filter((file) => !existsSync(join(resumeDir, file)))

  if (missing !== null && missing.length === 0) {
    mkdirSync(publicDir, { recursive: true })
    for (const file of expected) {
      copyFileSync(join(resumeDir, file), join(publicDir, file))
    }
    // eslint-disable-next-line no-console
    console.log(
      `[www] synced ${expected.length} résumé document(s) from @some-ui/resume`
    )
  } else {
    const detail =
      missing === null
        ? "documents/manifest.json not found"
        : `${missing.length} of ${expected.length} compiled résumé documents ` +
          `missing: ${missing.join(", ")}`

    if (process.env["CI"]) {
      // A warning is right for a developer and wrong for a release: missing
      // PDFs ship a 404 behind every download (e.g. a turbo cache hit that
      // restored no `documents/`).
      throw new Error(
        `[www] ${detail} in ${resumeDir}. Refusing to build a site whose ` +
          "résumé template picker would 404 on those options - check that " +
          "@some-ui/resume built completely, and that its output directory " +
          "is listed in turbo.json's build outputs."
      )
    }

    // eslint-disable-next-line no-console
    console.warn(
      `\n[www] ${detail} - the /resume route's download and desktop preview ` +
        "will 404 until they exist. Build the source package first:\n" +
        "  pnpm --filter @some-ui/resume build\n"
    )
  }
}
