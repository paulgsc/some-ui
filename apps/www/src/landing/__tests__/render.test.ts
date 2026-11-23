/**
 * The landing (PAGES, #3401): what the public site's front page says, read
 * from `renderLanding` on the résumé's real data and the show resolved
 * against its real walkthroughs, so a change to any of them shows here.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { landingMochi, mochiSvg } from "@/landing/mochi"
import { SITE_BASE } from "@/landing/output"
import type { LandingMedia } from "@/landing/render"
import {
  escapeHtml,
  landingMediaKeys,
  PHOTO,
  renderLanding,
  renderLandingHead,
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
  [
    firstFaces[0].key,
    { width: 1080, height: 1920, preview: `${firstFaces[0].key}.preview.webp` },
  ],
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

  it("lets a reader send the mochi a hug, a button on a page with no script, moving only where the show moves, and drops it for a photo (C1187)", () => {
    const slot = page.slice(
      page.indexOf('<figure class="photo"'),
      page.indexOf("</figure>", page.indexOf('<figure class="photo"'))
    )
    expect(slot).toContain(
      `<button type="button" class="hug" aria-label="${LANDING_WORDS.hug}">`
    )
    expect(slot).toContain('<span class="hug-heart" aria-hidden="true"><svg')
    expect(page).not.toMatch(/<script|onclick|onpointer/i)
    // The hug moves only where the show moves, and by the individual
    // properties, never transform, which would stop the idle loops.
    const template = readFileSync(
      join(import.meta.dirname, "../../../landing/index.html"),
      "utf8"
    )
    // The wide block, to its own closing brace.
    const open = template.indexOf(`@media ${WIDE_MOTION} {`)
    let depth = 0
    let close = open
    for (let i = template.indexOf("{", open); i < template.length; i++) {
      if (template[i] === "{") depth++
      else if (template[i] === "}" && --depth === 0) {
        close = i
        break
      }
    }
    const wide = template.slice(open, close)
    const pressed = [...template.matchAll(/\.hug:active[^{]*\{([^}]*)\}/g)]
    expect(pressed.length).toBeGreaterThan(1)
    for (const [rule, body] of pressed) {
      expect(body, rule).not.toMatch(/(^|[\s;{])transform\s*:/)
      if (/\b(scale|rotate|translate):/.test(body))
        expect(wide, rule).toContain(rule)
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
        /<div class="pair tk [^"]+" data-episode="([^"]+)" aria-hidden="true">/g
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
      expect(cube.match(/<div class="face"/g)).toHaveLength(4)
      expect(cube).toContain('class="cube-cap cube-cap--left"')
      expect(cube).toContain('class="cube-cap cube-cap--right"')
      episode.scenes.forEach((scene, s) =>
        expect(cube).toContain(
          `data-asset="${scene.faces[0].key}" style="--i: ${String(s)};`
        )
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
        /<div class="skeletons tk s-\d+" data-episode="([a-z]+)" aria-hidden="true" style="--sweep-at: [^"]+">([\s\S]*?)<div class="pair /g
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

  it("gives each scene one bounded snap stop with the matching narration and two faces", () => {
    const scenes = EPISODES.flatMap((episode) => episode.scenes)
    const flat = page.slice(page.indexOf('<div class="flat">'))
    const stops = [
      ...flat.matchAll(
        /<section class="scene-flat" id="show-scene-(\d+)"[\s\S]*?<\/section>/g
      ),
    ]
    expect(stops).toHaveLength(scenes.length)
    scenes.forEach((scene, index) => {
      const stop = stops.at(index)
      if (stop === undefined) throw new Error("missing scene stop")
      const [block, position] = stop
      expect(position).toBe(String(index + 1))
      expect(block).toContain(
        `Scene ${String(index + 1)} of ${String(scenes.length)}`
      )
      expect(block).toContain(`${escapeHtml(scene.title)}</h4>`)
      const links = [...block.matchAll(/href="#show-scene-(\d+)"/g)].map(
        (match) => Number(match[1])
      )
      expect(links).toEqual(
        [index, index + 2].filter((stop) => stop > 0 && stop <= scenes.length)
      )
      for (const face of scene.faces) {
        expect(block).toContain(`data-asset="${face.key}"`)
        expect(block).toContain(
          `<div class="caption"><p>${escapeHtml(face.label)}</p></div>`
        )
      }
    })
  })

  it("shows each slot's asset when the build carries it, and only then", () => {
    const [clip, still] = firstFaces
    expect(withMedia).toContain(`<source src="${SITE_BASE}media/${clip.key}"`)
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

  it("autoplays desktop clips and gives narrow clips a native player without autoplay", () => {
    const videos = [...withMedia.matchAll(/<video\b[^>]*>/g)].map((m) => m[0])
    expect(videos).toHaveLength(2)
    const [desktop, narrow] = videos
    expect(desktop).toContain('autoplay loop aria-hidden="true"')
    expect(desktop).not.toContain("controls")
    expect(narrow).toContain("controls aria-label=")
    expect(narrow).not.toContain("autoplay")
    expect(withMedia).toContain(`media="${WIDE_MOTION}"`)
    expect(withMedia).toContain(
      'media="(width < 900px) and (prefers-reduced-motion: no-preference)"'
    )
    for (const video of videos) {
      expect(video).toContain('preload="none"')
      expect(video).toContain('poster="')
      expect(video).toContain("muted playsinline")
    }
  })

  it("shares the same clip preview across both layouts and keeps its display ratio", () => {
    const clip = firstFaces[0]
    const preview = `${SITE_BASE}media/${clip.key}.preview.webp`
    const posters = [...withMedia.matchAll(/<video[^>]+poster="([^"]+)"/g)]
    expect(posters.map((match) => match[1])).toEqual([
      expect.stringMatching(/^data:image\/gif;/),
      preview,
    ])
    const underlays = [
      ...withMedia.matchAll(
        /class="media-preview" aria-hidden="true"><img src="([^"]+)"/g
      ),
    ]
    // The episode’s waiting screen and both scene layouts use one preview.
    expect(underlays.filter((match) => match[1] === preview)).toHaveLength(3)
    expect(stageOf(withMedia)).toContain(
      `data-asset="${clip.key}" style="--i: `
    )
    expect(stageOf(withMedia)).toContain("--ar: 1080 / 1920; --r: 0.5625")
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

  it("keeps navigation outside the media cards", () => {
    const cards = [...withMedia.matchAll(/<article\b[\s\S]*?<\/article>/g)]
    expect(cards.length).toBeGreaterThan(0)
    for (const [card] of cards) expect(card).not.toMatch(/<a\b|<button/)
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

  it("gates the desktop clock and the narrow scroll-driven turns on motion preference", () => {
    const template = readFileSync(
      join(import.meta.dirname, "../../../landing/index.html"),
      "utf8"
    )
    expect(template).toContain(`@media ${WIDE_MOTION} {`)
    expect(template).toMatch(
      /@media \(width < 900px\) and \(prefers-reduced-motion: no-preference\) \{\s*@supports \(animation-timeline: view\(inline\)\) \{[\s\S]*?animation-timeline: --scene;/
    )
    expect(template).toMatch(/\.media\s*\{[^}]*object-fit:\s*contain;/)
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

  it("carries no script and links only to scenes, GitHub, mail and its own PDF", () => {
    const html = page + renderLandingHead()
    expect(html).not.toMatch(/<script/i)
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      expect(href).toMatch(
        /^(https:\/\/github\.com\/paulgsc|https:\/\/paulgsc\.github\.io\/some-ui\/$|mailto:|#show-scene-\d+$|resume\.pdf$)/
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
