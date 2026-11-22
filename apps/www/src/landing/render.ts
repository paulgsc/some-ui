/**
 * The public site's front page (PAGES, #3401; C1055): a CV a recruiter reads
 * in one screen, drawn at build time from the résumé's own data and the
 * landing's words (`words.ts`). Pure: data in, HTML out, so a test reads
 * exactly what Pages serves. vite.config.ts writes it into
 * `landing/index.html`, the Pages build's `index.html`.
 *
 * The page carries no script. Every card is a picture with its words below
 * it, never over it (C1110). "What I built and use every day" is the
 * showcase (C1113): on a wide screen, a block of copy turning about Y beside
 * two cubes turning about X, each a `Ring` turned by CSS alone (`ringCss`,
 * in the page's head), each cube face fitting its clip or still whole inside
 * its screen, its title typed in as it comes round. A face whose asset the
 * build lacks shows the project's title card. On a phone, and for a reader
 * who prefers less motion, the projects lie flat as cards and nothing turns,
 * types or breathes (landing/index.html). The gaps keep their row of cards,
 * each taking its still's own shape (C1064). A slot's asset is shown only
 * when the build carries it (`media`; output.ts, `SITE_MEDIA_DIR`). The
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

/** A picture's shape as a CSS aspect ratio. */
const aspect = ({ width, height }: MediaSize): string =>
  `${String(width)} / ${String(height)}`

/**
 * A gap's card takes its picture's own shape (C1064): `--ar` for its aspect
 * ratio, `--r` for the width it asks of its row, so a row of cards of
 * different shapes shares one height and no picture is cropped or padded.
 */
const shape = (size: MediaSize): string =>
  `--ar: ${aspect(size)}; --r: ${(size.width / size.height).toFixed(4)}`

/**
 * A slot's asset, as the background of its picture: a clip plays muted on a
 * loop, a still just sits there; neither is a control (C1064) nor read out.
 */
const mediaTag = (key: string): string =>
  key.endsWith(".mp4")
    ? `<video class="media" src="${mediaSrc(key)}" autoplay muted loop playsinline disablepictureinpicture disableremoteplayback preload="metadata" aria-hidden="true"></video>`
    : `<img class="media" src="${mediaSrc(key)}" alt="" aria-hidden="true" />`

/**
 * A ring (C1113): faces stood around an axis, turned face to face on a
 * schedule by CSS alone, since the page runs no script. The showcase's copy
 * block is one about Y (a rectangle, so its faces stand around a vertical
 * axis), and each of its cubes one about X (a square). One type for all
 * three, so a ring of another count, axis or pace is a new value, never new
 * CSS. It rests on each face `restS` seconds, turns in `turnS`, and ends
 * where it began, so the loop never jumps. A ring has three faces or more
 * (`ringCss`).
 */
export type Ring = {
  readonly name: "copy" | "cube"
  readonly faces: number
  readonly axis: "x" | "y"
  readonly restS: number
  readonly turnS: number
}

/** The copy block's ring, over `faces` faces of copy. */
export const copyRing = (faces: number): Ring => ({
  name: "copy",
  faces,
  axis: "y",
  restS: 9,
  turnS: 1.4,
})

/** A cube's ring, over every project. */
export const cubeRing = (faces: number): Ring => ({
  name: "cube",
  faces,
  axis: "x",
  restS: 6,
  turnS: 1.2,
})

/** How many cubes the showcase shows side by side. */
export const CUBES = 2

/** Seconds a face's title takes to type in, once its face has come round. */
export const TYPE_S = 1.1

const slotOf = (ring: Ring): number => ring.restS + ring.turnS
const cycleOf = (ring: Ring): number => slotOf(ring) * ring.faces

/**
 * A start `seconds` into a ring's schedule, as an animation delay: never
 * positive, so the animation is already running when the page opens, at
 * the point it would have reached, rather than waiting and then jumping.
 */
const startAt = (ring: Ring, seconds: number): number =>
  (seconds % cycleOf(ring)) - cycleOf(ring)

/** A number for CSS, rounded to three places with no trailing zeros. */
const num = (n: number): string => String(Number(n.toFixed(3)))

/**
 * A ring's CSS: its turn as one keyframes rule, and its face count and
 * cycle, which landing/index.html's ring rules read. A face stands at its
 * index's angle (rotateY forward, rotateX back, so the next face rises from
 * below), and the turn brings each to the front in order.
 */
export function ringCss(ring: Ring): string {
  // Two faces stand back to back at no depth, and one at none: below three
  // a ring is no shape, so the build fails rather than drawing nonsense.
  if (!Number.isInteger(ring.faces) || ring.faces < 3) {
    throw new Error(
      `the ${ring.name} ring needs three faces or more, not ${String(ring.faces)}`
    )
  }
  const slot = slotOf(ring)
  const cycle = cycleOf(ring)
  const pct = (seconds: number): string => `${num((seconds / cycle) * 100)}%`
  const rotate = ring.axis === "y" ? "rotateY" : "rotateX"
  const sign = ring.axis === "y" ? -1 : 1
  const at = (face: number): string =>
    `transform: translateZ(calc(-1 * var(--depth))) ${rotate}(${num((sign * 360 * face) / ring.faces)}deg);`
  const steps = Array.from(
    { length: ring.faces },
    (_, face) =>
      `${pct(face * slot)}, ${pct(face * slot + ring.restS)} { ${at(face)} }`
  )
  return `@keyframes turn-${ring.name} { ${steps.join(" ")} 100% { ${at(ring.faces)} } }
      .ring--${ring.name} { --faces: ${String(ring.faces)}; --cycle: ${num(cycle)}s; }
      .ring--${ring.name} .ring-turn { animation-name: turn-${ring.name}; }`
}

/**
 * The typing of a ring's face titles: hidden when the face comes round,
 * revealed across `TYPE_S` (a step a character, set on each title), then
 * held until the face comes round again.
 */
export function typeCss(ring: Ring): string {
  return `@keyframes type-${ring.name} { 0% { clip-path: inset(0 100% 0 0); } ${num((TYPE_S / cycleOf(ring)) * 100)}%, 100% { clip-path: inset(0 0 0 0); } }
      .ring--${ring.name} .typed { animation-name: type-${ring.name}; }`
}

/**
 * One project on a cube's face, `position` faces round from the front, in a
 * ring that starts turning `delayS` late. Its screen holds the project's
 * title card under its clip or still when the build carries one; its band,
 * on a wide screen, holds its title, typed in as the face comes round, and
 * its short line; its caption, on a phone or for a reader who prefers less
 * motion, holds its title, stack and line. Every word is below the picture.
 * Laid flat, the screen takes its picture's own shape (`--ar`, C1064), so
 * the picture fills it; on a cube's square face it sits whole inside it.
 */
const projectFace = (
  p: ProjectWords,
  ring: Ring,
  position: number,
  delayS: number,
  media: LandingMedia
): string => `
            <article class="face" data-slot="${p.media.endsWith(".mp4") ? "clip" : "still"}" data-asset="${e(p.media)}" style="--i: ${String(position)}; --ar: ${aspect(media.get(p.media) ?? PLACEHOLDER)}">
              <div class="screen">
                <div class="title-card" aria-hidden="true"><span>${e(p.title)}</span></div>${
                  media.has(p.media)
                    ? `
                ${mediaTag(p.media)}`
                    : ""
                }
              </div>
              <div class="band" aria-hidden="true">
                <p class="band-title"><span class="typed" style="animation-delay: ${num(startAt(ring, delayS + position * slotOf(ring)))}s; animation-timing-function: steps(${String([...p.title].length)}, end)">${e(p.title)}</span></p>
                <p class="band-line">${e(p.short)}</p>
              </div>
              <div class="caption">
                <h3>${e(p.title)}</h3>
                <p class="stack">${e(p.stack)}</p>
                <p>${e(p.line)}</p>
              </div>
            </article>`

/**
 * The showcase (C1113): on a wide screen, one row of the copy block and
 * `CUBES` cubes, each block breathing a little and each holding still while
 * the pointer is on it. Every cube carries every project, the cube `j`
 * starting `j / CUBES` of the way round, so no two show the same project at
 * once, and turning half a face's time after the one before it, so they
 * never turn together. Only the first cube is read out, and only it shows,
 * laid flat, on a phone or for a reader who prefers less motion.
 */
function showcase(words: LandingWords, media: LandingMedia): string {
  const cube = cubeRing(words.projects.length)
  const n = words.projects.length
  const copyFaces = words.copy
    .map(
      (c, i) => `
            <div class="face copy" style="--i: ${String(i)}">
              <p class="kicker">${e(c.kicker)}</p>
              <p class="headline">${e(c.headline)}</p>
              <p>${e(c.line)}</p>
            </div>`
    )
    .join("")
  const cubes = Array.from({ length: CUBES }, (_, j) => {
    const delayS = (j * slotOf(cube)) / CUBES
    const offset = Math.floor((j * n) / CUBES)
    const faces = [
      ...words.projects.slice(offset),
      ...words.projects.slice(0, offset),
    ]
      .map((p, position) => projectFace(p, cube, position, delayS, media))
      .join("")
    return `
        <div class="block block--cube" data-cube="${String(j)}"${j === 0 ? "" : ' aria-hidden="true"'}>
          <div class="ring ring--cube" data-axis="x">
            <div class="ring-turn" style="animation-delay: ${num(startAt(cube, delayS))}s">${faces}
            </div>
          </div>
        </div>`
  }).join("")
  return `
      <div class="showcase">
        <div class="block block--copy">
          <div class="ring ring--copy" data-axis="y">
            <div class="ring-turn">${copyFaces}
            </div>
          </div>
        </div>${cubes}
      </div>`
}

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
 * the showcase's rings, drawn for their face counts.
 */
export function renderLandingHead(words: LandingWords = LANDING_WORDS): string {
  return `<title>${e(words.title)}</title>
    <meta name="description" content="${e(words.description)}" />
    <link rel="canonical" href="${SITE_URL}" />
    <style>
      ${[copyRing(words.copy.length), cubeRing(words.projects.length)].map(ringCss).join("\n      ")}
      ${typeCss(cubeRing(words.projects.length))}
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
${showcase(words, media)}
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
