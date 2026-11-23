/**
 * The public site's front page (PAGES, #3401; C1055): a CV a recruiter reads
 * in one screen, drawn at build time from the résumé's own data and the
 * landing's words (`words.ts`). Pure: data in, HTML out, so a test reads
 * exactly what Pages serves. vite.config.ts writes it into
 * `landing/index.html`, the Pages build's `index.html`.
 *
 * The page reads whole with no script. Its one script (`enhance.ts`, C1422)
 * only enhances the show: the phone's deck turns by a swipe, a face's media
 * crossfades in over its preview once it can be shown, and a clip plays only
 * while its face is in view. Every card is a picture with its words below
 * it, never over it (C1113). The photo slot holds the mochi, the brand
 * cast's own drawing (`landingMochi`), until the owner's photo is bundled; a
 * reader can send it a hug (C1187).
 */
import type { ResumeData } from "@some-ui/resume"

import { SHOW_BREAK_PX } from "./deck.ts"
import type { MediaSize } from "./media.ts"
import type { LandingMochi } from "./mochi.ts"
import { MEDIA_PATH, SITE_BASE, SITE_URL } from "./output.ts"
import type { ResolvedEpisode, ResolvedFace, SlotKind } from "./show.ts"
import { everyScene, showMediaKeys } from "./show.ts"
import type { LandingTheme, ThemePicker } from "./themes.ts"
import { themeCss, themePicker } from "./themes.ts"
import type { SceneTracks, Timeline } from "./timeline.ts"
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

/**
 * A slot's asset as the build carries it: its picture's size, and the key
 * of its tiny preview when the producer made one the build can afford
 * (`PREVIEW_BUDGET`, C1422).
 */
export type LandingAsset = MediaSize & { readonly preview?: string }

/** The media the build carries, by key, each with its picture's size when it has one. */
export type LandingMedia = ReadonlyMap<string, LandingAsset | null>

/**
 * What the page spends on previews (#3470 §4): a preview is a 40 px WebP the
 * producer writes beside its asset (`show-faces.ts`); the build serves one
 * only within its own limit and the page's, else the slot shows the themed
 * screen.
 */
export const PREVIEW_BUDGET = { each: 2 * 1024, page: 24 * 1024 } as const

/** A slot's preview's key, beside its asset. */
export const previewKey = (key: string): string => `${key}.preview.webp`

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
 * A slot's asset, as the background of its picture: a clip plays muted on a
 * loop, inline, with no controls, on every screen (C1064; the owner on
 * #3470); a still just sits there; neither is a control nor read out.
 */
const mediaTag = (key: string, slot: SlotKind): string =>
  slot === "clip"
    ? `<video class="media" src="${mediaSrc(key)}" autoplay muted loop playsinline disablepictureinpicture disableremoteplayback preload="metadata" aria-hidden="true"></video>`
    : `<img class="media" src="${mediaSrc(key)}" alt="" aria-hidden="true" decoding="async" />`

/**
 * Where the show moves: a wide screen whose reader allows motion. Every
 * track is named only under it, so all of them begin in the one style change
 * that brings it in (a page opened narrow and then widened included), and
 * one clock keeps them together (`timeline.ts`).
 */
export const WIDE_MOTION = `(width >= ${String(SHOW_BREAK_PX)}px) and (prefers-reduced-motion: no-preference)`

/** The show's tracks as CSS: every keyframes rule, each named only where the show moves. */
function showCss(timeline: Timeline): string {
  const tracks = tracksOf(timeline)
  return `${tracks.map((t) => t.keyframes).join("\n      ")}
      .show { --show: ${num(timeline.cycleS)}s; --show-start: -${num(EPISODE_TURN_S)}s; }
      @media ${WIDE_MOTION} { ${tracks.map((t) => `.${t.name} { animation-name: ${t.name}; }`).join(" ")} }`
}

/**
 * A face's picture. Where the build carries its asset: an aperture in the
 * asset's own shape (#3470 §5), holding its preview (the producer's tiny
 * frame, or a themed screen) with the slot's mark, and the clip or still
 * over it, which the enhancement crossfades in once it can be shown (and
 * swaps for the title card should it fail). Where it doesn't: the face's
 * title card, as ever (C1113). Laid flat the screen takes the picture's own
 * shape (C1064); on a cube's face the aperture sits whole inside it.
 */
const screen = (face: ResolvedFace, media: LandingMedia): string => {
  const asset = shown(media, face.key)
  const card = (more: string): string =>
    `<div class="title-card${more}" aria-hidden="true"><span>${e(face.label)}</span></div>`
  if (asset === undefined) return card("")
  return `<div class="aperture" style="${shape(asset)}">
                  <div class="preview" aria-hidden="true">${
                    asset.preview === undefined
                      ? ""
                      : `<img src="${mediaSrc(asset.preview)}" alt="" decoding="async" />`
                  }<span class="mark">${SKELETON_GLYPH[face.slot]}</span></div>
                  ${card(" title-card--failed")}
                  ${mediaTag(face.key, face.slot)}
                </div>`
}

/** A face on a cube: its picture, and its band, whose label types in as it arrives. */
const cubeFace = (
  face: ResolvedFace | undefined,
  at: number,
  scene: SceneTracks | undefined,
  j: 0 | 1,
  media: LandingMedia
): string =>
  face === undefined || scene === undefined
    ? `
              <div class="face face--blank" style="--i: ${String(at)}"></div>`
    : `
              <div class="face" data-slot="${face.slot}" data-asset="${e(face.key)}" data-on="${num(scene.on[0])} ${num(scene.on[1])}" style="--i: ${String(at)}">
                <div class="screen">${screen(face, media)}
                </div>
                <div class="band">
                  <p class="band-title"><span class="tk ${scene.labels[j].name}">${e(face.label)}</span></p>
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

/**
 * A face's place before it arrives: a skeleton in the face's own shape (a
 * screen above a band), showing what is coming by the face's own preview
 * where the build has one, and by its glyph, with no words a reader could
 * take for content.
 */
const skeletonSlot = (face: ResolvedFace, media: LandingMedia): string => {
  const preview = shown(media, face.key)?.preview
  return `
          <div class="skeleton" data-skeleton="${face.slot}">
            <div class="skeleton-screen">${
              preview === undefined
                ? ""
                : `<img src="${mediaSrc(preview)}" alt="" decoding="async" />`
            }${SKELETON_GLYPH[face.slot]}</div>
            <div class="skeleton-band"><span></span></div>
          </div>`
}

/**
 * How tall an episode's cubes stand, as a share of their width (#3470 §5):
 * tall enough for the narrowest picture they turn to, so a phone's capture
 * gets the width it can, within bounds that keep the stage in one screen.
 * The same for both cubes and for the whole episode, so nothing changes
 * size while they turn.
 */
export const TALL = { min: 0.9, max: 1.35 } as const
/** A cube's band under its screen, as a share of its width. */
const BAND = 0.16

export function pairTall(
  episode: ResolvedEpisode,
  media: LandingMedia
): number {
  const needs = everyScene(episode).flatMap((scene) =>
    scene.faces.map((face) => {
      const size = shown(media, face.key) ?? PLACEHOLDER
      return size.height / size.width + BAND
    })
  )
  return Math.min(TALL.max, Math.max(TALL.min, ...needs))
}

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
                  <p class="scene-title"><span class="tk ${t.title.name}">${e(scene.title)}</span></p>${t.lines
                    .map(
                      // A pool's place holds a line for each its snacks
                      // may say (`timedScenes`); a line its draw lacks is
                      // left empty.
                      (line, l) => `
                  <p class="line tk ${line.name}">${e(scene.narration[l] ?? "")}</p>`
                    )
                    .join("")}
                </div>`
        })
        .join("")
      return `
            <section class="face copy" data-copy="${episode.id}" style="--i: ${String(k)}">
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
      const tall = pairTall(episode, media)
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
                      tracks.scenes[s],
                      j,
                      media
                    )
                ).join("")}
                  <div class="cap cap--left"></div>
                  <div class="cap cap--right"></div>
                </div>
              </div>
            </div>
          </div>`
        )
        .join("")
      const coming = episode.scenes[0]?.faces ?? []
      return `
        <div class="skeletons tk ${tracks.skeleton.name}" data-episode="${episode.id}" aria-hidden="true" style="--tall: ${num(tall)}; --sweep-at: ${num(tracks.start)}s">${coming
          .map((face) => skeletonSlot(face, media))
          .join("")}
        </div>
        <div class="pair tk ${tracks.pair.name}" data-episode="${episode.id}" aria-hidden="true" style="--tall: ${num(tall)}">${cubes}
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

/**
 * The show laid flat, on a phone and for a reader who prefers less motion:
 * each episode, each of its scenes' copy, and the scene's two faces as cards
 * in their own shapes, the label below each picture. It is the whole show
 * with no script; with it, on a phone, the same scenes are the deck
 * (`deck.ts`), one at a time, each scene's copy naming its episode
 * (`scene-of`, shown only there).
 */
function flat(
  episodes: ReadonlyArray<ResolvedEpisode>,
  media: LandingMedia
): string {
  let at = 0
  return episodes
    .map(
      (episode) => `
        <section class="episode" data-episode="${episode.id}">
          <p class="kicker">${e(episode.kicker)}</p>
          <h3>${e(episode.title)}</h3>${episode.scenes
            .map(
              (scene) => `
          <div class="scene-flat" data-scene="${String(at++)}">
            <div class="scene-copy">
              <p class="scene-of"><span class="kicker">${e(episode.kicker)}</span> ${e(episode.title)}</p>
              <h4>${e(scene.title)}</h4>${scene.narration
                .map(
                  (line) => `
              <p>${e(line)}</p>`
                )
                .join("")}
            </div>
            <div class="grid">${scene.faces
              .map(
                (face) => `
              <article class="card" data-slot="${face.slot}" data-asset="${e(face.key)}" style="${shape(shown(media, face.key) ?? PLACEHOLDER)}">
                <div class="screen">${screen(face, media)}
                </div>
                <div class="caption"><p>${e(face.label)}</p></div>
              </article>`
              )
              .join("")}
            </div>
          </div>`
            )
            .join("")}
        </section>`
    )
    .join("")
}

/**
 * An episode's pool (#3473), for the enhancement to draw from: each snack's
 * copy and its two faces, rendered once into an inert template, so nothing
 * in it loads until a draw puts it on the page. With no script the page
 * shows the pool's first draw, which the stage and the list already hold.
 */
function pool(episode: ResolvedEpisode, media: LandingMedia): string {
  if (episode.pool === null) return ""
  return `
        <template class="pool" data-episode="${episode.id}" data-draw="${String(episode.pool.draw)}">${episode.pool.snacks
          .map(
            (snack) => `
          <div class="snack">
            <p class="snack-title">${e(snack.title)}</p>${snack.narration
              .map(
                (line) => `
            <p class="snack-line">${e(line)}</p>`
              )
              .join("")}${snack.faces
              .map(
                (face) => `
            <div class="snack-face" data-slot="${face.slot}" data-asset="${e(face.key)}" data-label="${e(face.label)}" data-shape="${shape(shown(media, face.key) ?? PLACEHOLDER)}">${screen(face, media)}
            </div>`
              )
              .join("")}
          </div>`
          )
          .join("")}
        </template>`
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
        </div>${episodes.map((episode) => pool(episode, media)).join("")}
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
                ? mediaTag(g.visual, "still")
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
