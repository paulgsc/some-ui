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
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const appDir = dirname(dirname(fileURLToPath(import.meta.url)))
const resumeDir = join(appDir, "../../packages/ui/resume/documents")
const publicDir = join(appDir, "public")

// `compile.mjs` writes documents/manifest.json listing exactly the PDF
// filenames that compile run produced (every composition x template, plus
// the `resume.pdf` default-composition alias). Reading it back — rather
// than hard-coding the list here, or importing @some-ui/resume's
// variant/template matrix across the package boundary — sidesteps two real
// problems: a hard-coded list drifted every time a template or composition
// was renamed or added (this is what "resume-systems.pdf" and
// "resume-learning.pdf" as fixed entries would have kept doing after the
// 2026-08-29 composition rename), and a cross-package JS import here would
// need a `../` path (banned by this workspace's eslint config) or a custom
// package.json `exports` subpath (silently wiped by
// @some-ui/vite-config's build, which overwrites that package's `exports`
// wholesale on every build).
//
// The full set from the manifest is required, not just "at least one
// file": apps/www's résumé template picker links to every one of these,
// and a partial `documents/` directory (a stopped-mid-way compile, a stale
// watch-mode output) would otherwise sync silently and ship a picker whose
// other options 404.
function expectedResumePdfs() {
  const manifestPath = join(resumeDir, "manifest.json")
  if (!existsSync(manifestPath)) return null
  return JSON.parse(readFileSync(manifestPath, "utf8"))
}

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
    `[www] synced ${expected.length} résumé PDF(s) from @some-ui/resume`
  )
} else {
  const detail =
    missing === null
      ? "documents/manifest.json not found"
      : `${missing.length} of ${expected.length} compiled résumé PDFs ` +
        `missing: ${missing.join(", ")}`

  if (process.env["CI"]) {
    // Warning is right for a developer and wrong for a release. Missing
    // PDFs here mean the site ships with a 404 behind every download and
    // desktop preview, and a warning in a green build is not something
    // anyone reads.
    //
    // This fires if @some-ui/resume's build output ever stops arriving -
    // the way it did when `documents/` was not listed in turbo.json's
    // build `outputs` and a cache hit restored nothing.
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
