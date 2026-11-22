/**
 * The public site's pages besides the landing (PAGES, #3401; C1055): the
 * résumé, one page a version, and the page for a path the site doesn't have.
 * Pure: data in, HTML out, so a test reads exactly what Pages serves. No
 * script; they share one stylesheet (`page.css`, landing/page.html).
 *
 * The résumé reads as HTML at every width, the same `ResumeDocument` the
 * app's phones show, rendered when the site is built
 * (render-public-site.ts), with each version's PDF a download beside it.
 */
import type { ResumeData } from "@some-ui/resume"

import type { SitePage } from "./output.ts"
import { SITE_BASE, SITE_URL } from "./output.ts"
import { escapeHtml as e } from "./render.ts"
import type { SiteWords } from "./site-words.ts"
import { SITE_WORDS } from "./site-words.ts"

/** One version's page, and the résumé it shows as HTML. */
export type ResumeVersion = {
  /** The page's directory under the site's root, e.g. `resume/qa/`. */
  readonly dir: string
  /** The version's PDF under the site's root, e.g. `resume-qa.pdf`. */
  readonly pdf: string
  readonly data: ResumeData
  /** `ResumeDocument`'s markup for `data`. */
  readonly documentHtml: string
}

const at = (path: string): string => `${SITE_BASE}${path}`

/** The résumé's stable identifier, which the deploy check reads. */
export const RESUME_ID = "paul-gathondu-resume"

const BUTTON =
  "bg-primary text-primary-foreground inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium"

/**
 * A version's `<head>` words: what a crawler, a link preview or the deploy
 * check (scripts/check-resume-deploy.mjs) reads without running anything, the
 * résumé's stable identifier among them.
 */
function resumeHead(version: ResumeVersion, words: SiteWords): string {
  const { profile, label } = version.data
  const title = e(words.resumeTitle(profile.name, label))
  const description = e(words.resumeDescription(profile.name, label))
  const url = `${SITE_URL}${version.dir}`
  const person = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Person",
    identifier: RESUME_ID,
    name: profile.name,
    url,
    sameAs: [`https://${profile.github}`],
  }).replaceAll("<", "\\u003c")
  return `<title>${title}</title>
    <meta name="description" content="${description}" />
    <meta name="resume-id" content="${RESUME_ID}" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="profile" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${url}" />
    <meta name="twitter:card" content="summary" />
    <script type="application/ld+json">${person}</script>`
}

function resumePage(
  version: ResumeVersion,
  all: ReadonlyArray<ResumeVersion>,
  words: SiteWords
): SitePage {
  const { profile, label } = version.data
  const others = all
    .filter(({ dir }) => dir !== version.dir)
    .map(
      ({ dir, data }) =>
        `<li><a class="underline underline-offset-2" href="${at(dir)}">${e(data.label)}</a></li>`
    )
    .join("")
  const download = `${profile.name.replaceAll(" ", "_")}_Resume.pdf`
  return {
    file: `${version.dir}index.html`,
    template: "page",
    head: resumeHead(version, words),
    body: `
    <header class="border-border bg-card border-b">
      <div class="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <p class="text-muted-foreground text-xs"><a class="underline underline-offset-2" href="${at("")}">${e(words.home)}</a></p>
          <h1 class="text-lg font-semibold">${e(words.resumeHeading)}</h1>
          <p class="text-muted-foreground text-xs">${e(label)}</p>
        </div>
        <a class="${BUTTON}" href="${at(version.pdf)}" download="${e(download)}">${e(words.download)}</a>
      </div>
    </header>
    <main class="mx-auto max-w-3xl px-5 py-6">${version.documentHtml}</main>
    <nav class="mx-auto max-w-3xl px-5 pb-10" aria-labelledby="h-versions">
      <h2 id="h-versions" class="text-muted-foreground text-xs font-bold tracking-wide uppercase">${e(words.versionsHeading)}</h2>
      <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">${others}</ul>
    </nav>`,
  }
}

/** Every version's page, each linking to the others. */
export function renderResumePages(
  versions: ReadonlyArray<ResumeVersion>,
  words: SiteWords = SITE_WORDS
): ReadonlyArray<SitePage> {
  return versions.map((v) => resumePage(v, versions, words))
}

/**
 * The page GitHub Pages serves for any path the site doesn't have, linking to
 * the front page and the résumé's page (`resumeDir`).
 */
export function renderNotFound(
  resumeDir: string,
  words: SiteWords = SITE_WORDS
): SitePage {
  return {
    file: "404.html",
    template: "page",
    head: `<title>${e(words.notFoundTitle)}</title>
    <meta name="robots" content="noindex" />`,
    body: `
    <main class="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-3 px-5 py-10">
      <h1 class="text-2xl font-semibold">${e(words.notFoundHeading)}</h1>
      <p class="text-muted-foreground">${e(words.notFoundLine)}</p>
      <p class="flex gap-4 font-medium"><a class="underline underline-offset-2" href="${at("")}">${e(words.home)}</a><a class="underline underline-offset-2" href="${at(resumeDir)}">${e(words.resumeLink)}</a></p>
    </main>`,
  }
}
