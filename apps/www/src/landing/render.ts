/**
 * The public site's front page (PAGES, #3401; C1055): a CV a recruiter reads
 * in one screen, drawn at build time from the résumé's own data and the
 * landing's words (`words.ts`). Pure: data in, HTML out, so a test reads
 * exactly what Pages serves. vite.config.ts writes it into
 * `landing/index.html`, the Pages build's `index.html`.
 *
 * The page carries no script. Every card is a picture with its words below
 * it, never over it (C1110). "What I built and use every day" is one pane, a
 * cube whose faces are the projects, turned face to face by CSS alone
 * (`cubeTurn`, in the page's head): each face fits its clip or still inside
 * its screen, whole, on the screen's dark, and a face whose asset the build
 * lacks shows the project's title card. The gaps keep their row of cards,
 * each taking its still's own shape (C1064). A slot's asset is shown only
 * when the build carries it (`media`; output.ts, `SITE_MEDIA_DIR`). A reader
 * who prefers less motion sees the cube's faces laid flat in a row, with
 * each clip's title card in place of the clip (landing/index.html). The
 * photo slot holds the mochi, the brand cast's own drawing (`mochiSvg`),
 * until the owner's photo is bundled.
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
 * A gap's card takes its picture's own shape (C1064): `--ar` for its aspect
 * ratio, `--r` for the width it asks of its row, so a row of cards of
 * different shapes shares one height and no picture is cropped or padded.
 */
const shape = ({ width, height }: MediaSize): string =>
  `--ar: ${String(width)} / ${String(height)}; --r: ${(width / height).toFixed(4)}`

/**
 * A slot's asset, as the background of its picture: a clip plays muted on a
 * loop, a still just sits there; neither is a control (C1064) nor read out.
 */
const mediaTag = (key: string): string =>
  key.endsWith(".mp4")
    ? `<video class="media" src="${mediaSrc(key)}" autoplay muted loop playsinline disablepictureinpicture disableremoteplayback preload="metadata" aria-hidden="true"></video>`
    : `<img class="media" src="${mediaSrc(key)}" alt="" aria-hidden="true" />`

/** Seconds each face of the cube rests facing the reader, then turning. */
export const CUBE_REST_S = 6
export const CUBE_TURN_S = 1.2

/**
 * The cube's turn (C1110) for `faces` faces, as one CSS keyframes rule: it
 * rests on each face for `CUBE_REST_S`, turns a face's angle in
 * `CUBE_TURN_S`, and ends where it began, so the loop never jumps. The
 * angles depend on how many faces there are, so the rule is drawn here with
 * the page rather than written once in the template.
 */
export function cubeTurn(faces: number): string {
  const slot = CUBE_REST_S + CUBE_TURN_S
  const pct = (seconds: number): string =>
    `${String(Number(((seconds / (slot * faces)) * 100).toFixed(3)))}%`
  const at = (face: number): string =>
    `transform: translateZ(var(--apothem)) rotateY(${String(Number(((-360 * face) / faces).toFixed(3)))}deg);`
  const steps = Array.from(
    { length: faces },
    (_, face) =>
      `${pct(face * slot)}, ${pct(face * slot + CUBE_REST_S)} { ${at(face)} }`
  )
  return `@keyframes cube-turn { ${steps.join(" ")} 100% { ${at(faces)} } }
      .cube { --faces: ${String(faces)}; --cycle: ${String(slot * faces)}s; }`
}

/**
 * One face of the cube: its screen, holding the project's title card under
 * the face's clip or still when the build carries one, and its words below
 * the screen.
 */
const projectFace = (
  p: ProjectWords,
  index: number,
  media: LandingMedia
): string => `
          <article class="face" data-slot="${p.media.endsWith(".mp4") ? "clip" : "still"}" data-asset="${e(p.media)}" style="--i: ${String(index)}">
            <div class="screen">
              <div class="title-card" aria-hidden="true"><span>${e(p.title)}</span></div>${
                media.has(p.media)
                  ? `
              ${mediaTag(p.media)}`
                  : ""
              }
            </div>
            <div class="caption">
              <h3>${e(p.title)}</h3>
              <p class="stack">${e(p.stack)}</p>
              <p>${e(p.line)}</p>
            </div>
          </article>`

/** The gap's drawn visual, by gap: what the still will show, drawn. */
const GAP_DRAWING: Readonly<Record<GapWords["id"], string>> = {
  "page-filter": `<div class="drawing drawing--filter" aria-hidden="true"><div class="page light"><span class="part"></span></div><div class="page dark"><span class="part white"></span></div></div>`,
  cores: `<div class="drawing drawing--cores" aria-hidden="true"><svg viewBox="0 0 400 150" preserveAspectRatio="none"><path d="M0 22 H400" class="cores-line"/><path d="M0 110 C40 90 70 50 110 46 S180 30 220 60 S300 28 340 38 S380 30 400 34 V150 H0Z" class="busy"/><path d="M0 146 C50 142 90 128 120 130 S200 112 240 126 S320 108 360 118 S390 112 400 114 V150 H0Z" class="waiting"/></svg></div>`,
}

/**
 * A gap's card: its picture (the still, or its drawing until the build
 * carries one) in its own shape, and its words below it.
 */
const gapCard = (g: GapWords, media: LandingMedia): string => {
  const size = media.get(g.visual)
  const shown = size !== undefined && size !== null
  return `
        <article class="card" data-slot="still" data-asset="${e(g.visual)}" style="${shape(size ?? PLACEHOLDER)}">
          <div class="pic">
            ${
              shown
                ? mediaTag(g.visual)
                : `${GAP_DRAWING[g.id]}
            <p class="note">${e(g.visualNote)}</p>`
            }
          </div>
          <div class="caption">
            <h3>${e(g.title)}</h3>
            <p>${e(g.line)}</p>
          </div>
        </article>`
}

/** The photo slot's asset: the owner's portrait, once one is bundled. */
export const PHOTO = "photo/portrait.webp"

/** Every asset key the landing's slots name: the photo, each clip, each still. */
export function landingMediaKeys(
  words: LandingWords = LANDING_WORDS
): ReadonlyArray<string> {
  // A still may show on a face and on a gap's card both; the build
  // carries it once.
  return [
    ...new Set([
      PHOTO,
      ...words.projects.map((p) => p.media),
      ...words.gaps.map((g) => g.visual),
    ]),
  ]
}

const role = (title: string, when: string, body: string): string => `
          <div class="job">
            <h3>${e(title)}</h3>
            <span class="when">${e(when)}</span>
            ${body}
          </div>`

/**
 * The page's `<head>`: its title, description and canonical address, and
 * the cube's turn for as many faces as there are projects.
 */
export function renderLandingHead(words: LandingWords = LANDING_WORDS): string {
  return `<title>${e(words.title)}</title>
    <meta name="description" content="${e(words.description)}" />
    <link rel="canonical" href="${SITE_URL}" />
    <style>
      ${cubeTurn(words.projects.length)}
    </style>`
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
      <div class="cube">
        <div class="cube-turn">${words.projects.map((p, i) => projectFace(p, i, media)).join("")}
        </div>
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
