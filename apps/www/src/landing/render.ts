/**
 * The public site's front page (PAGES, #3401; C1055): a CV a recruiter reads
 * in one screen, drawn at build time from the résumé's own data and the
 * landing's words (`words.ts`). Pure: data in, HTML out, so a test reads
 * exactly what Pages serves. vite.config.ts writes it into
 * `landing/index.html`, the Pages build's `index.html`.
 *
 * The page carries no script. Every card is a picture with its words below
 * it, never over it (C1113). The photo slot holds the mochi, the brand
 * cast's own drawing (`landingMochi`), until the owner's photo is bundled; a
 * reader can send it a hug (C1187).
 */
import type { ResumeData } from "@some-ui/resume"

import type { MediaSize } from "./media.ts"
import type { LandingMochi } from "./mochi.ts"
import { MEDIA_PATH, SITE_BASE, SITE_URL } from "./output.ts"
import type { ResolvedEpisode, ResolvedFace, SlotKind } from "./show.ts"
import { showMediaKeys } from "./show.ts"
import type { LandingTheme, ThemePicker } from "./themes.ts"
import { themeCss, themePicker } from "./themes.ts"
import type { Timeline, Track } from "./timeline.ts"
import { EPISODE_TURN_S, num, showTimeline, tracksOf } from "./timeline.ts"
import type { GapWords, LandingWords } from "./words.ts"
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

export type LandingAsset = MediaSize & { readonly preview?: string }

/** The media the build carries, by key, each with its picture's size when it has one. */
export type LandingMedia = ReadonlyMap<string, LandingAsset | null>

/** A card's shape when it has no picture of its own: its placeholder's. */
const PLACEHOLDER: MediaSize = { width: 4, height: 3 }

/**
 * A card laid flat takes its picture's own shape (C1064): `--ar` for its
 * aspect ratio, `--r` for the width it asks of its row, so a row of cards of
 * different shapes shares one height and no picture is cropped or padded.
 */
const shape = ({ width, height }: MediaSize): string =>
  `--ar: ${String(width)} / ${String(height)}; --r: ${(width / height).toFixed(4)}`

/** The size of a slot's asset when the build carries it to show. */
const shown = (media: LandingMedia, key: string): LandingAsset | undefined =>
  media.get(key) ?? undefined

/**
 * Where the show moves: a wide screen whose reader allows motion. Every
 * track is named only under it, so all of them begin in the one style change
 * that brings it in (a page opened narrow and then widened included), and
 * one clock keeps them together (`timeline.ts`).
 */
export const WIDE_MOTION =
  "(width >= 900px) and (prefers-reduced-motion: no-preference)"

/** The show's tracks as CSS: every keyframes rule, each named only where the show moves. */
function showCss(timeline: Timeline): string {
  const tracks = tracksOf(timeline)
  return `${tracks.map((t) => t.keyframes).join("\n      ")}
      .show { --show: ${num(timeline.cycleS)}s; --show-start: -${num(EPISODE_TURN_S)}s; }
      @media ${WIDE_MOTION} { ${tracks.map((t) => `.${t.name} { animation-name: ${t.name}; }`).join(" ")} }`
}

/** A transparent native poster keeps the themed preview visible until video paints. */
const EMPTY_POSTER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

function screen(
  face: ResolvedFace,
  media: LandingMedia,
  desktop: boolean
): string {
  const asset = shown(media, face.key)
  const poster =
    desktop || asset?.preview === undefined
      ? EMPTY_POSTER
      : mediaSrc(asset.preview)
  const preview = previewSlot(face, asset?.preview)
  if (asset === undefined)
    return `${preview}<div class="title-card" aria-hidden="true"><span>${e(face.label)}</span></div>`
  if (face.slot === "still")
    return `${preview}<img class="media" src="${mediaSrc(face.key)}" loading="lazy" decoding="async" alt="" />`
  const playback = desktop
    ? 'autoplay loop aria-hidden="true"'
    : `controls aria-label="${e(face.label)}"`
  const query = desktop
    ? WIDE_MOTION
    : "(width < 900px) and (prefers-reduced-motion: no-preference)"
  return `${preview}<video class="media" ${playback} muted playsinline disablepictureinpicture disableremoteplayback preload="none" loading="lazy" poster="${poster}"><source src="${mediaSrc(face.key)}" type="video/mp4" media="${query}" /></video>`
}

/** A face on a cube: its picture, and its band, whose label types in as it arrives. */
const cubeFace = (
  face: ResolvedFace | undefined,
  at: number,
  label: Track | undefined,
  media: LandingMedia
): string =>
  face === undefined || label === undefined
    ? `<div class="face" style="--i: ${String(at)}"></div>`
    : `
              <div class="face" data-slot="${face.slot}" data-asset="${e(face.key)}" style="--i: ${String(at)}; ${shape(shown(media, face.key) ?? PLACEHOLDER)}">
                <div class="screen">${screen(face, media, true)}
                </div>
                <div class="band">
                  <p class="band-title"><span class="tk ${label.name}">${e(face.label)}</span></p>
                </div>
              </div>`

/**
 * Each skeleton's glyph (C1185): a frame with a play mark for a clip, a frame
 * with a sun over hills for a still. Drawn in the theme's ink by the page's
 * CSS (`currentColor`).
 */
const SKELETON_GLYPH: Readonly<Record<SlotKind, string>> = {
  clip: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"><rect x="5" y="9" width="38" height="30" rx="5"/><path d="M20 17.5v13l11-6.5z" fill="currentColor"/></svg>`,
  still: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"><rect x="5" y="9" width="38" height="30" rx="5"/><circle cx="17" cy="19" r="3.5"/><path d="M8 35l11-11 8 8 5-5 9 9"/></svg>`,
}

/** Asset previews and their clip/still marks are decorative. */
function previewSlot(face: ResolvedFace, preview?: string): string {
  return `<div class="media-preview" aria-hidden="true">${preview === undefined ? "" : `<img src="${mediaSrc(preview)}" alt="" />`}<span>${SKELETON_GLYPH[face.slot]}</span></div>`
}

/** The pair's places before its first turn. */
const skeletonSlot = (face: ResolvedFace, media: LandingMedia): string => `
          <div class="skeleton" data-skeleton="${face.slot}"${shown(media, face.key) === undefined ? "" : " data-pending"} style="${shape(shown(media, face.key) ?? PLACEHOLDER)}">
            <div class="screen">${previewSlot(face, shown(media, face.key)?.preview)}</div>
            <div class="skeleton-band"><span></span></div>
          </div>`

/**
 * The stage (C1180, C1182): the copy block, an episode a face about Y, each
 * holding its scenes' copy as it streams in; and an episode's pair of cubes,
 * a scene a face about X, in view while its episode plays. The copy is what
 * a screen reader reads; the cubes only show it.
 */
function stage(
  episodes: ReadonlyArray<ResolvedEpisode>,
  timeline: Timeline,
  media: LandingMedia
): string {
  const copyFaces = episodes
    .map((episode, k) => {
      const tracks = timeline.episodes.at(k)
      const scenes = episode.scenes
        .map((scene, s) => {
          const t = tracks?.scenes.at(s)
          if (t === undefined) return ""
          return `
                <div class="scene tk ${t.block.name}">
                  <p class="scene-title"><span class="tk ${t.title.name}">${e(scene.title)}</span></p>${scene.narration
                    .map(
                      (line, l) => `
                  <p class="line tk ${t.lines.at(l)?.name ?? ""}">${e(line)}</p>`
                    )
                    .join("")}
                </div>`
        })
        .join("")
      return `
            <section class="face copy" style="--i: ${String(k)}">
              <p class="kicker">${e(episode.kicker)}</p>
              <h3 class="headline">${e(episode.title)}</h3>
              <div class="scenes">${scenes}
              </div>
            </section>`
    })
    .join("")
  const pairs = episodes
    .map((episode, k) => {
      const tracks = timeline.episodes.at(k)
      if (tracks === undefined) return ""
      const cubes = ([0, 1] as const)
        .map(
          (j) => `
          <div class="block block--cube">
            <div class="ring ring--cube">
              <div class="cube-camera">
                <div class="ring-turn tk ${tracks.cubes[j].name}">${Array.from(
                  { length: CUBE_FACES },
                  (_, s) =>
                    cubeFace(
                      episode.scenes[s]?.faces[j],
                      s,
                      tracks.scenes[s]?.labels[j],
                      media
                    )
                ).join("")}
                  <div class="cube-cap cube-cap--left"></div>
                  <div class="cube-cap cube-cap--right"></div>
                </div>
              </div>
            </div>
          </div>`
        )
        .join("")
      const coming = episode.scenes[0]?.faces ?? []
      return `
        <div class="skeletons tk ${tracks.skeleton.name}" data-episode="${episode.id}" aria-hidden="true" style="--sweep-at: ${num(tracks.skeletonSweepS)}s">${coming
          .map((face) => skeletonSlot(face, media))
          .join("")}
        </div>
        <div class="pair tk ${tracks.pair.name}" data-episode="${episode.id}" aria-hidden="true">${cubes}
        </div>`
    })
    .join("")
  return `
      <div class="stage">
        <div class="block block--copy">
          <div class="ring ring--copy" style="--faces: ${String(episodes.length)}">
            <div class="ring-turn tk ${timeline.copy.name}">${copyFaces}
            </div>
          </div>
        </div>${pairs}
      </div>`
}

/** A cube has four faces about X: an episode's scenes, and any left over blank. */
const CUBE_FACES = 4

/** One scroll-snap stop per published scene. Its three blocks share its scroll position. */
function flat(
  episodes: ReadonlyArray<ResolvedEpisode>,
  media: LandingMedia
): string {
  const scenes = episodes.flatMap((episode) =>
    episode.scenes.map((scene) => ({ episode, scene }))
  )
  const navigation = (index: number, label: string): string =>
    index > 0 && index <= scenes.length
      ? `<a href="#show-scene-${String(index)}">${label}</a>`
      : `<span aria-disabled="true">${label}</span>`

  return scenes
    .map(({ episode, scene }, index) => {
      const position = index + 1
      const id = `show-scene-${String(position)}`
      return `
          <section class="scene-flat" id="${id}" data-episode="${episode.id}" tabindex="-1" aria-labelledby="${id}-title">
            <nav class="scene-nav" aria-label="Project scenes">
              ${navigation(position - 1, "Previous")}
              <span>Scene ${String(position)} of ${String(scenes.length)}</span>
              ${navigation(position + 1, "Next")}
            </nav>
            <div class="scene-narration">
              <p class="kicker">${e(episode.kicker)}</p>
              <h3>${e(episode.title)}</h3>
              <h4 id="${id}-title">${e(scene.title)}</h4>${scene.narration
                .map((line) => `<p>${e(line)}</p>`)
                .join("")}
            </div>
            <div class="grid">${scene.faces
              .map(
                (face) => `
              <article class="card" data-slot="${face.slot}" data-asset="${e(face.key)}" style="${shape(shown(media, face.key) ?? PLACEHOLDER)}">
                <div class="screen">${screen(face, media, false)}
                </div>
                <div class="caption"><p>${e(face.label)}</p></div>
              </article>`
              )
              .join("")}
            </div>
          </section>`
    })
    .join("")
}

/** The show: its stage where it moves, laid flat everywhere else. */
function show(
  episodes: ReadonlyArray<ResolvedEpisode>,
  media: LandingMedia
): string {
  if (episodes.length === 0) return ""
  return `
      <div class="show">${stage(episodes, showTimeline(episodes), media)}
        <div class="flat">${flat(episodes, media)}
        </div>
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
  const size = shown(media, g.visual)
  return `
        <article class="card" data-slot="still" data-asset="${e(g.visual)}" style="${shape(size ?? PLACEHOLDER)}">
          <div class="pic">
            ${
              size !== undefined
                ? `<img class="media" src="${mediaSrc(g.visual)}" alt="" />`
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

/**
 * The mochi, a reader can send a hug (C1187): a button that, pressed, sets a
 * heart rising from it (and, where the page moves, squeezes it, curls its
 * antennas in and narrows its eyes), all of it CSS on :active, so the page
 * runs no script and keeps nothing.
 */
const hug = (mochi: LandingMochi, words: LandingWords): string =>
  `<button type="button" class="hug" aria-label="${e(words.hug)}"><span class="hug-body">${mochi.svg}</span><span class="hug-heart" aria-hidden="true">${mochi.heart}</span></button>`

/** Every asset key the landing's slots name: the photo, each face, each still. */
export function landingMediaKeys(
  words: LandingWords = LANDING_WORDS,
  episodes: ReadonlyArray<ResolvedEpisode> = []
): ReadonlyArray<string> {
  return [
    ...new Set([
      PHOTO,
      ...showMediaKeys(episodes),
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
 * The page's `<head>`: its title, description and canonical address, its
 * colours from the repo's themes (`themeCss`), and the show's tracks
 * (`showCss`).
 */
export function renderLandingHead(
  words: LandingWords = LANDING_WORDS,
  episodes: ReadonlyArray<ResolvedEpisode> = [],
  themes: ReadonlyArray<LandingTheme> = []
): string {
  const css = [
    ...(themes.length === 0 ? [] : [themeCss(themes)]),
    ...(episodes.length === 0 ? [] : [showCss(showTimeline(episodes))]),
  ]
  return `<title>${e(words.title)}</title>
    <meta name="description" content="${e(words.description)}" />
    <link rel="canonical" href="${SITE_URL}" />${
      css.length === 0
        ? ""
        : `
    <style>
      ${css.join("\n      ")}
    </style>`
    }`
}

/**
 * The page's `<body>` content, from one résumé version (its profile, roles,
 * dates and education), the landing's words, the keys of the media the
 * build carries, the show (`show.ts`, resolved), and the theme picker
 * (`themes.ts`).
 */
export function renderLanding(
  resume: ResumeData,
  mochi: LandingMochi,
  words: LandingWords = LANDING_WORDS,
  media: LandingMedia = new Map(),
  episodes: ReadonlyArray<ResolvedEpisode> = [],
  picker: ThemePicker | null = null
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
        ${
          media.has(PHOTO)
            ? `<figure class="photo" data-slot="photo" data-asset="${PHOTO}" role="img" aria-label="${e(words.photoAlt)}"><img src="${mediaSrc(PHOTO)}" alt="" /></figure>`
            : `<figure class="photo" data-slot="photo" data-asset="${PHOTO}">${hug(mochi, words)}</figure>`
        }
        <div class="who">
          <h1>${e(profile.name)}</h1>
          <p class="role">${e(words.role + where)}</p>
          <div class="contact">
            <a class="btn" href="resume.pdf">${e(words.resume)}</a>
            ${link(profile.email, `mailto:${profile.email}`)}
            ${link(profile.github, `https://${profile.github}`)}
          </div>
        </div>${picker === null ? "" : `\n        ${themePicker(picker, words, e)}`}
      </div>
    </header>
    <main>
      <p class="lede">${e(words.lede)}</p>
      <h2 class="section-title">${e(words.projectsTitle)}</h2>
${show(episodes, media)}
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
