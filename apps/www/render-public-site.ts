// Renders the public site's pages (PAGES, #3401; C1055) from the résumé's
// data, into node_modules' cache, where vite.config.ts's `publicSite` reads
// them for the Pages build: the landing, the résumé's page for each version,
// the authorship record's page, and the page for a path the site doesn't
// have. The www build runs it before `vite build`, beside
// scripts/sync-resume.mjs, as check-bundle-paths.ts does.
//
// A step of its own rather than an import in vite.config.ts: every build
// loads that config, and the recording stage's walk (scripts/stage-packages.ts,
// RI3) reads its imports as the packages the render image must build. The
// site is the Pages build's alone, so @some-ui/resume stays off that walk.
//
// Run with node (type stripping), from apps/www: node render-public-site.ts.
// It sits beside vite.config.ts and check-bundle-paths.ts, so it reaches the
// site's modules by a same-directory path, as they do.

import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { createElement } from "react"
import { resumeData, ResumeDocument } from "@some-ui/resume"
import { renderToStaticMarkup } from "react-dom/server"

import { mochiSvg } from "./src/landing/mochi.ts"
import type { RenderedSite, SitePage } from "./src/landing/output.ts"
import { SITE_FILE, SITE_MEDIA_DIR } from "./src/landing/output.ts"
import type { ResumeVersion } from "./src/landing/pages.ts"
import { renderNotFound, renderResumePages } from "./src/landing/pages.ts"
import {
  landingMediaKeys,
  renderLanding,
  renderLandingHead,
} from "./src/landing/render.ts"
import type { ResumeComposition } from "./src/lib/resume-files.ts"
import {
  DEFAULT_RESUME_COMPOSITION,
  RESUME_VERSIONS,
  resumeStem,
} from "./src/lib/resume-files.ts"

/** A version's page: the default at `resume/`, the rest beneath it. */
const dirOf = (id: ResumeComposition): string =>
  id === DEFAULT_RESUME_COMPOSITION ? "resume/" : `resume/${id}/`

const versions: ReadonlyArray<ResumeVersion> = RESUME_VERSIONS.map((id) => ({
  dir: dirOf(id),
  pdf: `${resumeStem(id)}.pdf`,
  data: resumeData[id],
  documentHtml: renderToStaticMarkup(
    createElement(ResumeDocument, { data: resumeData[id] })
  ),
}))

// The media the build was given (SITE_MEDIA_DIR): a slot shows its asset
// when the file is there, and its placeholder when it isn't.
const media = landingMediaKeys().filter((key) =>
  existsSync(resolve(import.meta.dirname, join(SITE_MEDIA_DIR, key)))
)

const pages: ReadonlyArray<SitePage> = [
  {
    file: "index.html",
    template: "landing",
    head: renderLandingHead(),
    body: renderLanding(
      resumeData.fullstack,
      mochiSvg(),
      undefined,
      new Set(media)
    ),
  },
  ...renderResumePages(versions),
  { file: "authorship/index.html", template: "authorship", head: "", body: "" },
  renderNotFound(dirOf(DEFAULT_RESUME_COMPOSITION)),
]

const out = resolve(import.meta.dirname, SITE_FILE)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify({ pages, media } satisfies RenderedSite))
process.stdout.write(
  `[www] rendered the public site's ${pages.length} pages, with ${media.length} of its ${landingMediaKeys().length} media, into ${SITE_FILE}\n`
)
