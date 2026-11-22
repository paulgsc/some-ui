/**
 * The words of the public site's pages besides the landing (PAGES, #3401;
 * C1055): the résumé's pages and the page for a path the site doesn't have.
 * One table, in the owner's first-person voice (CLAUDE.md, "Say what it
 * is"); the person's facts come from the résumé's own data (`pages.ts`).
 */
export type SiteWords = {
  readonly resumeTitle: (name: string, version: string) => string
  readonly resumeDescription: (name: string, version: string) => string
  readonly resumeHeading: string
  readonly download: string
  readonly versionsHeading: string
  readonly home: string
  readonly notFoundTitle: string
  readonly notFoundHeading: string
  readonly notFoundLine: string
  readonly resumeLink: string
}

export const SITE_WORDS: SiteWords = {
  resumeTitle: (name, version) => `${name}, résumé (${version})`,
  resumeDescription: (name, version) =>
    `Résumé of ${name}, software engineer in Rust and TypeScript (${version}): read it here or download the PDF.`,
  resumeHeading: "Résumé",
  download: "Download the PDF",
  versionsHeading: "Other versions",
  home: "Front page",
  notFoundTitle: "Not on this site",
  notFoundHeading: "This page isn't here",
  notFoundLine:
    "This site is my CV: a front page, my résumé, and the record each of my videos links to.",
  resumeLink: "Résumé",
}
