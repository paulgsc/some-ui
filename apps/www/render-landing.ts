// Renders the public site's front page (PAGES, #3401; C1055) from the
// résumé's data, into node_modules' cache, where vite.config.ts's
// `landingPage` reads it for the Pages build. The www build runs it before
// `vite build`, beside scripts/sync-resume.mjs, as check-bundle-paths.ts
// does.
//
// A step of its own rather than an import in vite.config.ts: every build
// loads that config, and the recording stage's walk (scripts/stage-packages.ts,
// RI3) reads its imports as the packages the render image must build. The
// landing is the Pages build's alone, so @some-ui/resume stays off that walk.
//
// Run with node (type stripping), from apps/www: node render-landing.ts. It
// sits beside vite.config.ts and check-bundle-paths.ts, so it reaches the
// landing's modules by a same-directory path, as they do.

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { resumeData } from "@some-ui/resume"

import { mochiSvg } from "./src/landing/mochi.ts"
import type { RenderedLanding } from "./src/landing/output.ts"
import { LANDING_FILE } from "./src/landing/output.ts"
import { renderLanding, renderLandingHead } from "./src/landing/render.ts"

const out = resolve(import.meta.dirname, LANDING_FILE)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(
  out,
  JSON.stringify({
    head: renderLandingHead(),
    body: renderLanding(resumeData.fullstack, mochiSvg()),
  } satisfies RenderedLanding)
)
process.stdout.write(`[www] rendered the landing into ${LANDING_FILE}\n`)
