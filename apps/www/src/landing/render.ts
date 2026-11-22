/**
 * The public site's front page (PAGES, #3401; C1055): a CV a recruiter reads
 * in one screen, drawn at build time from the résumé's own data and the
 * landing's words (`words.ts`). Pure: data in, HTML out, so a test reads
 * exactly what Pages serves. vite.config.ts writes it into
 * `landing/index.html`, the Pages build's `index.html`.
 *
 * The page carries no script. Its project and gap cards are each a picture
 * with the card's own words laid over it (C1064): the picture is the card's
 * background, not something to watch or work, and takes the card's shape
 * from its own size, so it fills the card with nothing cropped or padded.
 * Every card draws a placeholder in CSS under its picture, a ground for a
 * clip and a labelled drawing for a gap; a slot whose asset is in the build
 * (`media`; output.ts, `SITE_MEDIA_DIR`) lays its clip, playing muted on a
 * loop, or its still over it. A reader who prefers less motion sees the
 * placeholder (landing/index.html). The photo slot holds the mochi, the
 * brand cast's own drawing (`mochiSvg`), until the owner's photo is bundled.
 */
import type { ResumeData } from "@some-ui/resume"

import type { MediaSize } from "./media.ts"
import { MEDIA_PATH, SITE_BASE, SITE_URL } from "./output.ts"
import type { GapWords, LandingWords, ProjectWords } from "./words.ts"
import { LANDING_WORDS } from "./words.ts"

/** Text into HTML, as text: the five characters that could open markup. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

const e = escapeHtml

/** A link the page offers; every one leaves for GitHub or mail. */
const link = (label: string, href: string): string =>
  `<a href="${e(href)}">${e(label)}</a>`

/** Where the build serves a slot's asset (vite.config.ts, `publicSite`). */
const mediaSrc = (key: string): string => `${SITE_BASE}${MEDIA_PATH}${e(key)}`

/** The media the build carries, by key, each with its picture's size when it has one. */
export type LandingMedia = ReadonlyMap<string, MediaSize | null>

/** A card's shape when it has no picture of its own: its placeholder's. */
const PLACEHOLDER: MediaSize = { width: 4, height: 3 }

/**
 * A card takes its picture's own shape (C1064): `--ar` for its aspect ratio,
 * `--r` for the width it asks of its row, so a row of cards of different
 * shapes shares one height and no picture is cropped or padded.
 */
const shape = ({ width, height }: MediaSize): string =>
  `--ar: ${String(width)} / ${String(height)}; --r: ${(width / height).toFixed(4)}`

/**
 * A card: its picture as its background, laid over its drawn placeholder,
 * and its own words over both, the only thing on it a reader takes in. Nothing
 * on a card is a link or a control (C1064, C1065); the page's header links to
 * the code.
 */
const card = (
  slot: "clip" | "still",
  key: string,
  placeholder: string,
  picture: string,
  words: string,
  size: MediaSize
): string => `
        <article class="card" data-slot="${slot}" data-asset="${e(key)}" style="${shape(size)}">
          <div class="pic">
            ${placeholder}${picture}
          </div>
          <div class="overlay${slot === "still" ? " overlay--side" : ""} rise">${words}
          </div>
        </article>`

const projectCard = (p: ProjectWords, media: LandingMedia): string => {
  const size = media.get(p.clip)
  return card(
    "clip",
    p.clip,
    `<div class="ground ground--${e(p.id)}" aria-hidden="true"></div>`,
    size === undefined || size === null
      ? ""
      : `
          <video class="media" src="${mediaSrc(p.clip)}" autoplay muted loop playsinline disablepictureinpicture disableremoteplayback preload="metadata" aria-hidden="true"></video>`,
    `
            <h3>${e(p.title)}</h3>
            <p class="stack">${e(p.stack)}</p>
            <p>${e(p.line)}</p>`,
    size ?? PLACEHOLDER
  )
}

/** The gap's drawn visual, by gap: what the still will show, drawn. */
const GAP_DRAWING: Readonly<Record<GapWords["id"], string>> = {
  "page-filter": `<div class="drawing drawing--filter" aria-hidden="true"><div class="page light"><span class="part"></span></div><div class="page dark"><span class="part white"></span></div></div>`,
  cores: `<div class="drawing drawing--cores" aria-hidden="true"><svg viewBox="0 0 400 150" preserveAspectRatio="none"><path d="M0 22 H400" class="cores-line"/><path d="M0 110 C40 90 70 50 110 46 S180 30 220 60 S300 28 340 38 S380 30 400 34 V150 H0Z" class="busy"/><path d="M0 146 C50 142 90 128 120 130 S200 112 240 126 S320 108 360 118 S390 112 400 114 V150 H0Z" class="waiting"/></svg></div>`,
}

const gapCard = (g: GapWords, media: LandingMedia): string => {
  const size = media.get(g.visual)
  const shown = size !== undefined && size !== null
  return card(
    "still",
    g.visual,
    shown
      ? ""
      : `${GAP_DRAWING[g.id]}
          <p class="note">${e(g.visualNote)}</p>`,
    shown
      ? `<img class="media" src="${mediaSrc(g.visual)}" alt="" aria-hidden="true" />`
      : "",
    `
            <h3>${e(g.title)}</h3>
            <p>${e(g.line)}</p>`,
    size ?? PLACEHOLDER
  )
}

/** The photo slot's asset: the owner's portrait, once one is bundled. */
export const PHOTO = "photo/portrait.webp"

/** Every asset key the landing's slots name: the photo, each clip, each still. */
export function landingMediaKeys(
  words: LandingWords = LANDING_WORDS
): ReadonlyArray<string> {
  return [
    PHOTO,
    ...words.projects.map((p) => p.clip),
    ...words.gaps.map((g) => g.visual),
  ]
}

const role = (title: string, when: string, body: string): string => `
          <div class="job">
            <h3>${e(title)}</h3>
            <span class="when">${e(when)}</span>
            ${body}
          </div>`

/** The page's `<head>` words: its title, description and canonical address. */
export function renderLandingHead(words: LandingWords = LANDING_WORDS): string {
  return `<title>${e(words.title)}</title>
    <meta name="description" content="${e(words.description)}" />
    <link rel="canonical" href="${SITE_URL}" />`
}

/**
 * The page's `<body>` content, from one résumé version (its profile, roles,
 * dates and education), the landing's words, and the keys of the media the
 * build carries.
 */
export function renderLanding(
  resume: ResumeData,
  mochiSvg: string,
  words: LandingWords = LANDING_WORDS,
  media: LandingMedia = new Map()
): string {
  const { profile } = resume
  const where = profile.location === null ? "" : ` · ${profile.location}`
  const jobs = [
    role(
      resume.engagement.role,
      resume.engagement.dates,
      `<p>${e(words.independentNote)}</p>`
    ),
    ...resume.additionalExperience.map((r) =>
      role(
        `${r.role}, ${r.org}`,
        r.detail === null ? r.dates : `${r.dates} · ${r.detail}`,
        r.bullets.length === 0
          ? ""
          : r.bullets.length === 1
            ? `<p>${e(r.bullets[0] ?? "")}</p>`
            : `<ul>${r.bullets.map((b) => `<li>${e(b)}</li>`).join("")}</ul>`
      )
    ),
  ].join("")
  const education = resume.education
    .map(
      (ed) => `<p>${e(`${ed.credential}, ${ed.institution}, ${ed.dates}`)}</p>`
    )
    .join("")
  return `
    <header class="top">
      <div class="in">
        <figure class="photo" data-slot="photo" data-asset="${PHOTO}" role="img" aria-label="${e(words.photoAlt)}">${media.has(PHOTO) ? `<img src="${mediaSrc(PHOTO)}" alt="" />` : mochiSvg}</figure>
        <div class="who">
          <h1>${e(profile.name)}</h1>
          <p class="role">${e(words.role + where)}</p>
          <div class="contact">
            <a class="btn" href="resume.pdf">${e(words.resume)}</a>
            ${link(profile.email, `mailto:${profile.email}`)}
            ${link(profile.github, `https://${profile.github}`)}
          </div>
        </div>
      </div>
    </header>
    <main>
      <p class="lede">${e(words.lede)}</p>
      <h2 class="section-title">${e(words.projectsTitle)}</h2>
      <div class="grid">${words.projects.map((p) => projectCard(p, media)).join("")}
      </div>
      <h2 class="section-title">${e(words.gapsTitle)}</h2>
      <div class="grid gaps">${words.gaps.map((g) => gapCard(g, media)).join("")}
      </div>
      <div class="two">
        <section aria-labelledby="h-exp">
          <h2 id="h-exp">${e(words.experienceTitle)}</h2>${jobs}
        </section>
        <section aria-labelledby="h-skills">
          <h2 id="h-skills">${e(words.skillsTitle)}</h2>
          <p>${e(words.skills)}</p>
          <h2>${e(words.educationTitle)}</h2>
          ${education}
        </section>
      </div>
      <footer>${e(words.footerKeeps)}</footer>
    </main>`
}
