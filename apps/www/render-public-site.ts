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
// Run with tsx, from apps/www: tsx render-public-site.ts. tsx, not node's
// own type stripping, because the brand's cast (the photo slot's mochi) is
// written for a bundler's resolution. It sits beside vite.config.ts and
// check-bundle-paths.ts, so it reaches the site's modules by a
// same-directory path, as they do.

import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { createElement } from "react"
import { resumeData, ResumeDocument } from "@some-ui/resume"
import { renderToStaticMarkup } from "react-dom/server"

import type { MediaSize } from "./src/landing/media.ts"
import { mp4HasSound, mp4Size, pngSize } from "./src/landing/media.ts"
import { mochiSvg } from "./src/landing/mochi.ts"
import type { RenderedSite, SitePage } from "./src/landing/output.ts"
import { SITE_FILE, SITE_MEDIA_DIR } from "./src/landing/output.ts"
import type { ResumeVersion } from "./src/landing/pages.ts"
import { renderNotFound, renderResumePages } from "./src/landing/pages.ts"
import type { LandingMedia } from "./src/landing/render.ts"
import {
  landingMediaKeys,
  PHOTO,
  renderLanding,
  renderLandingHead,
} from "./src/landing/render.ts"
import type { WalkthroughCopy } from "./src/landing/show.ts"
import {
  isWalkthroughCopy,
  publicEpisodes,
  resolveShow,
  SHOW,
} from "./src/landing/show.ts"
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

/**
 * What the build was given for `key` (SITE_MEDIA_DIR): undefined where there
 * is no regular file (never a link, which could name a file elsewhere on the
 * machine), or one the landing won't show; else the picture's size, which
 * the card takes as its shape (null for the photo, whose slot is round).
 * A clip with a sound track is refused: the landing plays no sound (C1064).
 */
function mediaFor(key: string): MediaSize | null | undefined {
  const file = resolve(import.meta.dirname, join(SITE_MEDIA_DIR, key))
  if (lstatSync(file, { throwIfNoEntry: false })?.isFile() !== true)
    return undefined
  if (key === PHOTO) return null
  const bytes = readFileSync(file)
  const size = key.endsWith(".mp4") ? mp4Size(bytes) : pngSize(bytes)
  const why =
    size === null
      ? "its size can't be read"
      : key.endsWith(".mp4") && mp4HasSound(bytes)
        ? "it carries sound"
        : null
  if (why === null) return size
  process.stdout.write(`[www] not showing ${key}: ${why}\n`)
  return undefined
}

/**
 * A walkthrough's chapters and captions (`some-ui.walkthrough/1`), read from
 * its file for the show's copy (C1181). Only the fields the landing reads are
 * checked here; the walkthrough's own schema (`@some-ui/video-motion`) holds
 * the rest where the video is made.
 */
function walkthroughCopy(path: string): WalkthroughCopy {
  const read: unknown = JSON.parse(
    readFileSync(resolve(import.meta.dirname, path), "utf8")
  )
  const fill =
    typeof read === "object" && read !== null && "fill" in read
      ? read.fill
      : undefined
  if (!isWalkthroughCopy(fill)) {
    throw new Error(`${path} is not a walkthrough's words`)
  }
  return fill
}

const resolved = resolveShow(SHOW, {
  jobs: walkthroughCopy("tests/walk/jobs-walkthrough.json"),
  "home-server": walkthroughCopy(
    "../../packages/video-motion/walks/home-server.json"
  ),
})
if (!resolved.ok) {
  throw new Error(`the landing's show: ${resolved.problems.join("; ")}`)
}
// Scenes the owner hasn't read yet show only in a preview on their machine
// (preview-pages.sh sets SITE_SHOW_DRAFTS); Pages never shows them.
const withDrafts = process.env["SITE_SHOW_DRAFTS"] === "1"
const episodes = publicEpisodes(resolved.episodes, withDrafts)
if (episodes.length < 2) {
  throw new Error("the landing's show has fewer than two episodes to show")
}
const drafts = resolved.episodes.reduce(
  (n, e) => n + e.scenes.filter((s) => s.draft).length,
  0
)
if (drafts > 0) {
  process.stdout.write(
    withDrafts
      ? `[www] showing the show's ${String(drafts)} draft scenes, for the owner to read\n`
      : `[www] leaving out the show's ${String(drafts)} draft scenes (SITE_SHOW_DRAFTS=1 shows them)\n`
  )
}

const media: LandingMedia = new Map(
  landingMediaKeys(undefined, episodes).flatMap((key) => {
    const found = mediaFor(key)
    return found === undefined ? [] : [[key, found] as const]
  })
)

const pages: ReadonlyArray<SitePage> = [
  {
    file: "index.html",
    template: "landing",
    head: renderLandingHead(undefined, episodes),
    body: renderLanding(
      resumeData.fullstack,
      mochiSvg(),
      undefined,
      media,
      episodes
    ),
  },
  ...renderResumePages(versions),
  { file: "authorship/index.html", template: "authorship", head: "", body: "" },
  renderNotFound(dirOf(DEFAULT_RESUME_COMPOSITION)),
]

const out = resolve(import.meta.dirname, SITE_FILE)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(
  out,
  JSON.stringify({ pages, media: [...media.keys()] } satisfies RenderedSite)
)
process.stdout.write(
  `[www] rendered the public site's ${pages.length} pages, with ${media.size} of its ${landingMediaKeys(undefined, episodes).length} media, into ${SITE_FILE}\n`
)
