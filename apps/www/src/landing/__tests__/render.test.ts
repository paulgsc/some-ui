/**
 * The landing (PAGES, #3401): what the public site's front page says, read
 * from `renderLanding` on the résumé's real data and the show resolved
 * against its real walkthroughs, so a change to any of them shows here.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DECK_QUERY } from "@/landing/deck"
import { landingMochi, mochiSvg } from "@/landing/mochi"
import { SITE_BASE } from "@/landing/output"
import type { LandingMedia } from "@/landing/render"
import {
  escapeHtml,
  landingMediaKeys,
  pairTall,
  PHOTO,
  previewKey,
  renderLanding,
  renderLandingHead,
  TALL,
  WIDE_MOTION,
} from "@/landing/render"
import type { ResolvedEpisode } from "@/landing/show"
import { SHOW, showFor } from "@/landing/show"
import { LANDING_WORDS } from "@/landing/words"
import { resumeData } from "@some-ui/resume"
import { MOCHI_BODY } from "@some-ui/styles/brand/mark"
import { describe, expect, it } from "vitest"

const ROOT = join(import.meta.dirname, "../../../../..")

// The whole show, drafts included, as the owner's preview draws it.
const resolved = showFor(
  SHOW,
  (path): unknown => JSON.parse(readFileSync(join(ROOT, path), "utf8")),
  true
)
if (!resolved.ok) throw new Error(resolved.problems.join("; "))
const EPISODES: ReadonlyArray<ResolvedEpisode> = resolved.episodes

const resume = resumeData.fullstack
const page = renderLanding(
  resume,
  landingMochi(),
  LANDING_WORDS,
  new Map(),
  EPISODES
)

/** The show's first scene with a clip on its left face and a still on its right. */
const clipScene = EPISODES.flatMap((e) => e.scenes).find(
  (s) => s.faces[0].key.endsWith(".mp4") && s.faces[1].key.endsWith(".png")
)
if (clipScene === undefined)
  throw new Error("no scene shows a clip beside a still")
const firstFaces = clipScene.faces
/** A build given that scene's two faces, the first gap's still and the photo. */
const MEDIA: LandingMedia = new Map([
  [firstFaces[0].key, { width: 1080, height: 1920 }],
  [firstFaces[1].key, { width: 800, height: 600 }],
  [LANDING_WORDS.gaps[0].visual, { width: 800, height: 600 }],
  [PHOTO, null],
])
const withMedia = renderLanding(
  resume,
  landingMochi(),
  LANDING_WORDS,
  MEDIA,
  EPISODES
)

describe("renderLanding", () => {
  it("says who, what, and how to reach them before anything else", () => {
    const header = page.slice(0, page.indexOf("<main>"))
    expect(header).toContain(`<h1>${resume.profile.name}</h1>`)
    expect(header).toContain(escapeHtml(LANDING_WORDS.role))
    expect(header).toContain(`href="mailto:${resume.profile.email}"`)
    expect(header).toContain(`href="https://${resume.profile.github}"`)
    expect(header).toContain('href="resume.pdf"')
  })

  it("has the photo slot, holding the mochi until a photo is bundled", () => {
    expect(page).toContain('data-slot="photo"')
    expect(page).toContain(`data-asset="${PHOTO}"`)
    expect(page).toContain(`d="${MOCHI_BODY}"`)
  })

  it("lets a reader send the mochi a hug, a button with no script, moving at every width where motion is allowed, and drops it for a photo (C1187, C1423)", () => {
    const slot = page.slice(
      page.indexOf('<figure class="photo"'),
      page.indexOf("</figure>", page.indexOf('<figure class="photo"'))
    )
    expect(slot).toContain(
      `<button type="button" class="hug" aria-label="${LANDING_WORDS.hug}">`
    )
    expect(slot).toContain('<span class="hug-heart" aria-hidden="true"><svg')
    expect(page).not.toMatch(/<script|onclick|onpointer/i)
    // The hug moves wherever motion is allowed, at every width, and by the
    // individual properties, never transform, which would stop the idle
    // loops.
    const template = readFileSync(
      join(import.meta.dirname, "../../../landing/index.html"),
      "utf8"
    )
    // The motion block, to its own closing brace.
    const open = template.indexOf(
      "@media (prefers-reduced-motion: no-preference) {"
    )
    let depth = 0
    let close = open
    for (let i = template.indexOf("{", open); i < template.length; i++) {
      if (template[i] === "{") depth++
      else if (template[i] === "}" && --depth === 0) {
        close = i
        break
      }
    }
    const moving = template.slice(open, close)
    // Not tied to a width: the hug and the idle loops play on a phone too.
    expect(moving).toMatch(/\.hug:active \.hug-body \{/)
    expect(moving).toMatch(/animation: mochi-blink /)
    expect(
      template.slice(template.indexOf(`@media ${WIDE_MOTION} {`))
    ).not.toMatch(/mochi-(blink|sway|lean) \d/)
    const pressed = [...template.matchAll(/\.hug:active[^{]*\{([^}]*)\}/g)]
    expect(pressed.length).toBeGreaterThan(1)
    for (const [rule, body] of pressed) {
      expect(body, rule).not.toMatch(/(^|[\s;{])transform\s*:/)
      if (/\b(scale|rotate|translate):/.test(body))
        expect(moving, rule).toContain(rule)
    }
    const withPhoto = renderLanding(
      resume,
      landingMochi(),
      LANDING_WORDS,
      new Map([[PHOTO, { width: 400, height: 400 }]])
    )
    expect(withPhoto).not.toContain('class="hug"')
    expect(withPhoto).toContain(
      `role="img" aria-label="${LANDING_WORDS.photoAlt}"`
    )
  })

  it("moves only the mochi's own named parts (C1186)", () => {
    const template = readFileSync(
      join(import.meta.dirname, "../../../landing/index.html"),
      "utf8"
    )
    const moved = [
      ...new Set(
        [...template.matchAll(/\[data-part="([a-z-]+)"\]/g)].map((m) => m[1])
      ),
    ]
    expect(moved.length).toBeGreaterThan(0)
    for (const part of moved)
      expect(mochiSvg()).toContain(`data-part="${part}"`)
  })

  it("shows the show, then each gap under its own title, with a slot each", () => {
    const projects = page.indexOf(escapeHtml(LANDING_WORDS.projectsTitle))
    const gaps = page.indexOf(escapeHtml(LANDING_WORDS.gapsTitle))
    expect(projects).toBeGreaterThan(-1)
    expect(gaps).toBeGreaterThan(projects)
    for (const episode of EPISODES) {
      const at = page.indexOf(escapeHtml(episode.title))
      expect(at).toBeGreaterThan(projects)
      expect(at).toBeLessThan(gaps)
      for (const scene of episode.scenes)
        for (const face of scene.faces)
          expect(page).toContain(`data-asset="${face.key}"`)
    }
    for (const g of LANDING_WORDS.gaps) {
      expect(page.indexOf(escapeHtml(g.title))).toBeGreaterThan(gaps)
      expect(page).toContain(`data-asset="${g.visual}"`)
      expect(page).toContain(escapeHtml(g.visualNote))
    }
  })

  /** The stage: everything from its opening to the flat show. */
  const stageOf = (html: string): string =>
    html.slice(
      html.indexOf('<div class="stage">'),
      html.indexOf('<div class="flat">')
    )

  it("stages every episode as a copy face, and a pair of four-faced cubes (C1180)", () => {
    const stage = stageOf(page)
    const copyFaces = stage.match(/<section class="face copy"/g) ?? []
    expect(copyFaces).toHaveLength(EPISODES.length)
    const pairs = [
      ...stage.matchAll(
        /<div class="pair tk [^"]+" data-episode="([^"]+)" aria-hidden="true" style="--tall: [\d.]+">/g
      ),
    ]
    expect(pairs.map((m) => m[1])).toEqual(EPISODES.map((e) => e.id))
    // Each pair is two cubes of four faces, the episode's scenes first.
    expect(stage.match(/<div class="block block--cube">/g)).toHaveLength(
      EPISODES.length * 2
    )
    for (const episode of EPISODES) {
      const pair = stage.slice(stage.indexOf(`data-episode="${episode.id}"`))
      const cube = pair.slice(
        0,
        pair.indexOf(
          '<div class="block block--cube">',
          pair.indexOf('<div class="block block--cube">') + 1
        )
      )
      expect(cube.match(/<div class="face[ "]/g)).toHaveLength(4)
      for (const scene of episode.scenes)
        expect(cube).toContain(`data-asset="${scene.faces[0].key}" data-on="`)
      episode.scenes.forEach((_, s) =>
        expect(cube).toContain(`style="--i: ${String(s)}"`)
      )
    }
  })

  it("streams each scene's copy in the copy block, a line at a time", () => {
    const stage = stageOf(page)
    const streamed = [
      ...stage.matchAll(/<p class="line tk s-\d+">([^<]*)<\/p>/g),
    ].map((m) => m[1])
    for (const episode of EPISODES)
      for (const scene of episode.scenes) {
        expect(stage).toContain(`${escapeHtml(scene.title)}</span></p>`)
        for (const line of scene.narration)
          expect(streamed).toContain(escapeHtml(line))
      }
  })

  it("stands a skeleton where each episode's first faces will come, telling a clip from a still", () => {
    const blocks = [
      ...stageOf(page).matchAll(
        /<div class="skeletons tk s-\d+" data-episode="([a-z]+)" aria-hidden="true" style="[^"]*">([\s\S]*?)<div class="pair /g
      ),
    ]
    expect(blocks.map((b) => b[1])).toEqual(EPISODES.map((e) => e.id))
    for (const [k, episode] of EPISODES.entries()) {
      const block = blocks[k]?.[2] ?? ""
      const kinds = [...block.matchAll(/data-skeleton="([a-z]+)"/g)].map(
        (m) => m[1]
      )
      expect(kinds, episode.id).toEqual(
        episode.scenes[0]?.faces.map((f) => f.slot)
      )
      // A glyph each, and no words to take for content.
      expect(block.match(/<svg /g)).toHaveLength(2)
      const text = [...block.matchAll(/>([^<]*)</g)].map((m) => m[1].trim())
      expect(text.filter((t) => t !== "")).toEqual([])
    }
  })

  it("lays every scene flat for a phone and less motion: its copy, then its two faces", () => {
    const flat = page.slice(page.indexOf('<div class="flat">'))
    for (const episode of EPISODES)
      for (const scene of episode.scenes) {
        const at = flat.indexOf(`<h4>${escapeHtml(scene.title)}</h4>`)
        expect(at).toBeGreaterThan(-1)
        const block = flat.slice(
          at,
          flat.indexOf("</div>\n          </div>", at)
        )
        for (const face of scene.faces) {
          expect(block).toContain(`data-asset="${face.key}"`)
          expect(block).toContain(
            `<div class="caption"><p>${escapeHtml(face.label)}</p></div>`
          )
        }
      }
  })

  it("shows each slot's asset when the build carries it, and only then", () => {
    const [clip, still] = firstFaces
    expect(withMedia).toContain(
      `<video class="media" src="${SITE_BASE}media/${clip.key}"`
    )
    expect(withMedia).toContain(
      `<img class="media" src="${SITE_BASE}media/${still.key}"`
    )
    expect(withMedia).toContain(`<img src="${SITE_BASE}media/${PHOTO}"`)
    expect(withMedia).not.toContain(`d="${MOCHI_BODY}"`)
    expect(withMedia).not.toContain(
      escapeHtml(LANDING_WORDS.gaps[0].visualNote)
    )
    expect(page).not.toMatch(/<video|<img/)
  })

  it("sets a face's media in an aperture of its own shape, over its preview, its title card kept for a failure (C1422)", () => {
    const [clip, still] = firstFaces
    const withPreview = renderLanding(
      resume,
      landingMochi(),
      LANDING_WORDS,
      new Map([
        [
          clip.key,
          { width: 1080, height: 1920, preview: previewKey(clip.key) },
        ],
        [still.key, { width: 800, height: 600 }],
      ]),
      EPISODES
    )
    const apertureOf = (key: string): string => {
      const at = withPreview.indexOf(`data-asset="${key}"`)
      const from = withPreview.indexOf('<div class="aperture"', at)
      return withPreview.slice(from, withPreview.indexOf('class="media"', from))
    }
    const clipped = apertureOf(clip.key)
    expect(clipped).toContain('style="--ar: 1080 / 1920; --r: 0.5625"')
    expect(clipped).toContain(
      `<img src="${SITE_BASE}media/${previewKey(clip.key)}" alt=""`
    )
    expect(clipped).toContain(
      'title-card title-card--failed" aria-hidden="true"'
    )
    expect(clipped).toMatch(/<div class="preview" aria-hidden="true">/)
    // Without a preview: the themed screen and the still's mark alone.
    const plain = apertureOf(still.key)
    expect(plain).toContain('style="--ar: 800 / 600; --r: 1.3333"')
    expect(plain).toMatch(
      /<div class="preview" aria-hidden="true"><span class="mark"><svg /
    )
  })

  it("stands an episode's cubes as tall as its narrowest picture needs, within bounds", () => {
    const episode = EPISODES.find((e) => e.scenes.includes(clipScene))
    if (episode === undefined) throw new Error("no episode")
    // A title card is 4:3, and its band below it.
    expect(pairTall(episode, new Map())).toBeCloseTo(0.75 + 0.16)
    // A 9:16 clip asks more than the bound gives.
    expect(pairTall(episode, MEDIA)).toBe(TALL.max)
    const square = new Map([[firstFaces[0].key, { width: 1000, height: 1000 }]])
    expect(pairTall(episode, square)).toBeCloseTo(1.16)
  })

  it("gives a face whose asset the build lacks its title card, its label on it", () => {
    for (const episode of EPISODES)
      for (const scene of episode.scenes)
        for (const face of scene.faces) {
          const at = page.indexOf(`data-asset="${face.key}"`)
          const card = page.slice(
            at,
            page.indexOf("</div>", page.indexOf("title-card", at))
          )
          expect(card).toContain(
            `<div class="title-card" aria-hidden="true"><span>${escapeHtml(face.label)}</span>`
          )
        }
  })

  it("lays a clip in its face as a background, never a player (C1064)", () => {
    const videos = [...withMedia.matchAll(/<video\b[^>]*>/g)].map((m) => m[0])
    // The stage's face and the flat card's.
    expect(videos).toHaveLength(2)
    for (const video of videos) {
      for (const attribute of [
        "autoplay",
        "muted",
        "loop",
        "playsinline",
        "disablepictureinpicture",
        'aria-hidden="true"',
      ])
        expect(video).toContain(attribute)
      expect(video).not.toMatch(/\bcontrols\b|tabindex|aria-label/)
    }
  })

  it("gives each card laid flat its picture's own shape, and its placeholder's without one", () => {
    const styles = new Map(
      [
        ...withMedia.matchAll(
          /class="card" data-slot="[a-z]+" data-asset="([^"]+)" style="([^"]+)"/g
        ),
      ].map((m) => [m[1], m[2]])
    )
    const style = (key: string): string => styles.get(key) ?? ""
    expect(style(firstFaces[0].key)).toBe("--ar: 1080 / 1920; --r: 0.5625")
    expect(style(firstFaces[1].key)).toBe("--ar: 800 / 600; --r: 1.3333")
    expect(style(LANDING_WORDS.gaps[1].visual)).toBe("--ar: 4 / 3; --r: 1.3333")
  })

  it("puts no link or control on a card: the page's header leads to the code", () => {
    const cards = [...withMedia.matchAll(/<article\b[\s\S]*?<\/article>/g)]
    expect(cards.length).toBeGreaterThan(0)
    for (const [card] of cards)
      expect(card).not.toMatch(/<a\b|<button|controls/)
  })

  it("names every track only where the show moves, on the show's one clock", () => {
    const head = renderLandingHead(LANDING_WORDS, EPISODES)
    const names = [...head.matchAll(/@keyframes (s-\d+) /g)].map((m) => m[1])
    expect(names.length).toBeGreaterThan(EPISODES.length * 3)
    expect(new Set(names).size).toBe(names.length)
    const wide = head.slice(head.indexOf(`@media ${WIDE_MOTION} {`))
    const classLists = [...page.matchAll(/class="([^"]*)"/g)].map((m) =>
      m[1].split(" ")
    )
    for (const name of names) {
      expect(wide).toContain(`.${name} { animation-name: ${name}; }`)
      // Every element a track moves names it, beside the one clock's class.
      expect(classLists).toContainEqual(expect.arrayContaining(["tk", name]))
    }
    const outside = head.slice(0, head.indexOf(`@media ${WIDE_MOTION} {`))
    expect(outside).not.toMatch(/animation-name\s*:/)
    expect(outside).toMatch(
      /\.show \{ --show: [\d.]+s; --show-start: -[\d.]+s; \}/
    )
    const template = readFileSync(
      join(import.meta.dirname, "../../../landing/index.html"),
      "utf8"
    )
    expect(template).toMatch(
      /\.tk \{\s*animation-delay: var\(--show-start\);\s*animation-duration: var\(--show\);/
    )
  })

  it("moves only where motion is allowed: the stage on a wide screen, the deck under a finger, the sheen and the mochi", () => {
    const template = readFileSync(
      join(import.meta.dirname, "../../../landing/index.html"),
      "utf8"
    )
    const css = template.slice(template.indexOf("<style>"))
    const start = css.indexOf(`@media ${WIDE_MOTION} {`)
    expect(start).toBeGreaterThan(-1)
    // The block ends where the next top-level rule starts.
    const end = css.indexOf("\n      }\n", start)
    const outside = css.slice(0, start) + css.slice(end)
    // Outside it, the rest move each in a block of its own: the phone's
    // deck, which turns only under the reader's finger (C1422), and, where
    // motion is allowed at any width, a preview's sheen and the mochi's
    // idle loops and hug (C1186, C1423). Nothing else is set moving or
    // turned: transforms live only in keyframes.
    const blockAt = (query: string): string => {
      const from = outside.indexOf(`@media ${query} {`)
      expect(from, query).toBeGreaterThan(-1)
      return outside.slice(from, outside.indexOf("\n      }\n", from))
    }
    const deck = blockAt(DECK_QUERY)
    const motion = blockAt("(prefers-reduced-motion: no-preference)")
    expect(deck).toMatch(/\.show\[data-deck\] [^{]*\{[^}]*transform:/)
    expect(motion).toMatch(/\.preview::after \{\s*animation: pass [^;]* 2;/)
    const keyframes = /@keyframes [a-z-]+ \{(?:[^{}]*\{[^{}]*\})*\s*\}/g
    const rules = outside
      .replace(deck, "")
      .replace(motion, "")
      .replace(keyframes, "")
    expect(outside.match(keyframes)?.length).toBeGreaterThan(0)
    expect(rules).not.toMatch(/\banimation(-name)?:/)
    expect(rules).not.toMatch(/(^|\s)transform:/m)
    // A slot's clip or still is never cropped and never something to click.
    expect(css).toMatch(
      /\.media\s*\{[^}]*object-fit:\s*contain;[^}]*pointer-events:\s*none;/
    )
  })

  it("names every slot's asset among the keys the build looks for", () => {
    const keys = landingMediaKeys(LANDING_WORDS, EPISODES)
    for (const key of keys) expect(page).toContain(`data-asset="${key}"`)
    expect(keys).toContain(PHOTO)
  })

  it("lists every role the résumé holds, with its dates", () => {
    expect(page).toContain(escapeHtml(resume.engagement.role))
    expect(page).toContain(escapeHtml(resume.engagement.dates))
    expect(resume.additionalExperience.length).toBeGreaterThan(0)
    for (const r of resume.additionalExperience) {
      expect(page).toContain(escapeHtml(`${r.role}, ${r.org}`))
      expect(page).toContain(escapeHtml(r.dates))
    }
    for (const ed of resume.education) {
      expect(page).toContain(escapeHtml(ed.institution))
    }
  })

  it("renders no script of its own (the template's one enhancement aside, C1422) and links nowhere but GitHub, mail and its own PDF", () => {
    const html = page + renderLandingHead()
    expect(html).not.toMatch(/<script/i)
    const template = readFileSync(
      join(import.meta.dirname, "../../../landing/index.html"),
      "utf8"
    )
    expect(
      [...template.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0])
    ).toEqual(['<script type="module" src="/src/landing/enhance.ts">'])
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      expect(href).toMatch(
        /^(https:\/\/github\.com\/paulgsc|https:\/\/paulgsc\.github\.io\/some-ui\/$|mailto:|resume\.pdf$)/
      )
    }
  })

  it("writes text as text", () => {
    const words = {
      ...LANDING_WORDS,
      lede: '<img src=x onerror="alert(1)">',
    }
    expect(renderLanding(resume, landingMochi(), words)).toContain(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
    )
  })
})
