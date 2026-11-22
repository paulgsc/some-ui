/**
 * The public site's pages (PAGES, #3401; C1055) as render-public-site.ts
 * leaves them for the Pages build, relative to apps/www, and their shape:
 * each page names the template vite.config.ts's `publicSite` fills and the
 * file it writes. In node_modules' cache, so it is never committed and never
 * shipped as a file of its own.
 */
export const SITE_FILE = "node_modules/.cache/www/public-site.json"

/**
 * The HTML templates the Pages build carries, by kind, relative to apps/www.
 * Each is an entry of that build; none is written under its own name.
 *
 * - `landing`: the front page, with its own inline styles and no script.
 * - `page`: a page of text with the site's one stylesheet and no script (the
 *   résumé, a missing page).
 * - `authorship`: the videos' authorship record, which draws the record its
 *   link carries and so is the site's one script.
 */
export const SITE_TEMPLATES = {
  landing: "landing/index.html",
  page: "landing/page.html",
  authorship: "landing/authorship.html",
} as const satisfies Record<string, string>

export type SiteTemplate = keyof typeof SITE_TEMPLATES

/** One page the site serves: its file, its template, and what fills it. */
export type SitePage = {
  /** Where the page is written in the build's output, e.g. `resume/index.html`. */
  readonly file: string
  readonly template: SiteTemplate
  /** The `<head>` words, in place of `<!--site:head-->`. */
  readonly head: string
  /** The `<body>` content, in place of `<!--site:body-->`. */
  readonly body: string
}

export function isSiteTemplate(value: unknown): value is SiteTemplate {
  return typeof value === "string" && Object.hasOwn(SITE_TEMPLATES, value)
}

/**
 * Where a page's link names the site's root: the Pages build puts its base
 * path (`/some-ui/`) in its place, so a link reads the same from any depth,
 * 404.html's included, which GitHub Pages serves at whatever path was asked.
 */
export const SITE_BASE = "%site:base%"

/** Where the site is published: a page's canonical address starts here. */
export const SITE_URL = "https://paulgsc.github.io/some-ui/"
