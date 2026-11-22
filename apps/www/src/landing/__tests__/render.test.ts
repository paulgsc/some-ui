/**
 * The landing (PAGES, #3401): what the public site's front page says, read
 * from `renderLanding` on the résumé's real data, so a change to either shows
 * here.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { mochiSvg } from "@/landing/mochi"
import { SITE_BASE } from "@/landing/output"
import type { LandingMedia } from "@/landing/render"
import {
  CUBE_REST_S,
  CUBE_TURN_S,
  cubeTurn,
  escapeHtml,
  landingMediaKeys,
  PHOTO,
  renderLanding,
  renderLandingHead,
} from "@/landing/render"
import { LANDING_WORDS } from "@/landing/words"
import { resumeData } from "@some-ui/resume"
import { MOCHI_BODY } from "@some-ui/styles/brand/mark"
import { describe, expect, it } from "vitest"

const resume = resumeData.fullstack
const page = renderLanding(resume, mochiSvg())

/** A build given a vertical clip for the first project, the first gap's still and the photo. */
const MEDIA: LandingMedia = new Map([
  [LANDING_WORDS.projects[0].media, { width: 1080, height: 1920 }],
  [LANDING_WORDS.gaps[0].visual, { width: 800, height: 600 }],
  [PHOTO, null],
])

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

  it("shows each project and each gap under its own title, with a slot each", () => {
    const projects = page.indexOf(escapeHtml(LANDING_WORDS.projectsTitle))
    const gaps = page.indexOf(escapeHtml(LANDING_WORDS.gapsTitle))
    expect(projects).toBeGreaterThan(-1)
    expect(gaps).toBeGreaterThan(projects)
    for (const p of LANDING_WORDS.projects) {
      const at = page.indexOf(escapeHtml(p.title))
      expect(at).toBeGreaterThan(projects)
      expect(at).toBeLessThan(gaps)
      expect(page).toContain(`data-asset="${p.media}"`)
    }
    for (const g of LANDING_WORDS.gaps) {
      expect(page.indexOf(escapeHtml(g.title))).toBeGreaterThan(gaps)
      expect(page).toContain(`data-asset="${g.visual}"`)
      expect(page).toContain(escapeHtml(g.visualNote))
    }
  })

  it("shows each slot's asset when the build carries it, and only then", () => {
    const [clip, ...rest] = LANDING_WORDS.projects
    const [still] = LANDING_WORDS.gaps
    const shown = renderLanding(resume, mochiSvg(), LANDING_WORDS, MEDIA)
    expect(shown).toContain(
      `<video class="media" src="${SITE_BASE}media/${clip.media}"`
    )
    expect(shown).toContain(
      `<img class="media" src="${SITE_BASE}media/${still.visual}"`
    )
    expect(shown).toContain(`<img src="${SITE_BASE}media/${PHOTO}"`)
    expect(shown).not.toContain(`d="${MOCHI_BODY}"`)
    expect(shown).not.toContain(escapeHtml(still.visualNote))
    for (const p of rest)
      if (p.media !== still.visual)
        expect(shown).not.toContain(`media/${p.media}`)
    expect(page).not.toMatch(/<video|<img/)
  })

  it("makes the projects one cube, a face each, turned by CSS alone (C1110)", () => {
    const cube = page.slice(
      page.indexOf('<div class="cube">'),
      page.indexOf(escapeHtml(LANDING_WORDS.gapsTitle))
    )
    const faces = [...cube.matchAll(/<article class="face"[^>]*>/g)]
    expect(faces.map((m) => m[0])).toEqual(
      LANDING_WORDS.projects.map(
        (p, i) =>
          `<article class="face" data-slot="${p.media.endsWith(".mp4") ? "clip" : "still"}" data-asset="${p.media}" style="--i: ${String(i)}">`
      )
    )
    const head = renderLandingHead()
    expect(head).toContain(cubeTurn(LANDING_WORDS.projects.length))
    expect(head).toContain(`--faces: ${String(LANDING_WORDS.projects.length)}`)
  })

  it("rests on each face, turns a face's angle, and ends where it began", () => {
    const slot = CUBE_REST_S + CUBE_TURN_S
    expect(cubeTurn(4)).toContain(
      `@keyframes cube-turn { 0%, ${String(Number(((CUBE_REST_S / (4 * slot)) * 100).toFixed(3)))}% { transform: translateZ(var(--apothem)) rotateY(0deg); }`
    )
    expect(cubeTurn(4)).toContain(
      "100% { transform: translateZ(var(--apothem)) rotateY(-360deg); } }"
    )
    expect(cubeTurn(4)).toContain(`--cycle: ${String(4 * slot)}s;`)
    expect(cubeTurn(3)).toContain("rotateY(-120deg)")
    expect(cubeTurn(3)).toContain("rotateY(-240deg)")
  })

  it("puts every card's words below its picture, never over it (C1110)", () => {
    const shown = renderLanding(resume, mochiSvg(), LANDING_WORDS, MEDIA)
    const cards = [...shown.matchAll(/<article\b[\s\S]*?<\/article>/g)].map(
      (m) => m[0]
    )
    expect(cards).toHaveLength(
      LANDING_WORDS.projects.length + LANDING_WORDS.gaps.length
    )
    for (const card of cards) {
      const picture = Math.max(
        card.indexOf('<div class="screen">'),
        card.indexOf('<div class="pic">')
      )
      const words = card.indexOf('<div class="caption">')
      expect(picture).toBeGreaterThan(-1)
      expect(words).toBeGreaterThan(picture)
      expect(card.indexOf("<h3>")).toBeGreaterThan(words)
      expect(card).not.toContain("overlay")
    }
  })

  it("gives a face whose asset the build lacks the project's title card", () => {
    for (const p of LANDING_WORDS.projects) {
      const at = page.indexOf(`data-asset="${p.media}"`)
      const face = page.slice(at, page.indexOf("</article>", at))
      expect(face).toContain(
        `<div class="title-card" aria-hidden="true"><span>${escapeHtml(p.title)}</span></div>`
      )
      expect(face).not.toContain('class="media"')
    }
  })

  it("lays a clip in its face as a background, never a player (C1064)", () => {
    const shown = renderLanding(resume, mochiSvg(), LANDING_WORDS, MEDIA)
    const videos = [...shown.matchAll(/<video\b[^>]*>/g)].map((m) => m[0])
    expect(videos).toHaveLength(1)
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
    expect(shown).toMatch(
      /<img class="media" src="[^"]+" alt="" aria-hidden="true" \/>/
    )
  })

  it("gives each gap's card its picture's own shape, and its placeholder's without one", () => {
    const [still, other] = LANDING_WORDS.gaps
    const shown = renderLanding(resume, mochiSvg(), LANDING_WORDS, MEDIA)
    const style = (key: string): string =>
      new RegExp(
        `class="card" data-slot="still" data-asset="${key}" style="([^"]+)"`
      ).exec(shown)?.[1] ?? ""
    expect(style(still.visual)).toBe("--ar: 800 / 600; --r: 1.3333")
    expect(style(other.visual)).toBe("--ar: 4 / 3; --r: 1.3333")
  })

  it("puts no link or control on a card: the page's header leads to the code", () => {
    const shown = renderLanding(resume, mochiSvg(), LANDING_WORDS, MEDIA)
    const cards = [...shown.matchAll(/<article\b[\s\S]*?<\/article>/g)]
    for (const [card] of cards)
      expect(card).not.toMatch(/<a\b|<button|controls/)
  })

  it("stills the cube and hides every moving clip from a reader who prefers less motion", () => {
    const template = readFileSync(
      join(import.meta.dirname, "../../../landing/index.html"),
      "utf8"
    )
    const reduced =
      /@media \(prefers-reduced-motion: reduce\)\s*\{([^@]*)\}\s*\/\*/.exec(
        template
      )?.[1]
    expect(reduced).toBeDefined()
    expect(reduced).toMatch(/\.cube-turn\s*\{[^}]*animation:\s*none;[^}]*\}/)
    expect(reduced).toMatch(/\.cube-turn\s*\{[^}]*transform:\s*none;/)
    expect(reduced).toMatch(/\.face\s*\{[^}]*transform:\s*none;/)
    expect(reduced).toMatch(/video\.media\s*\{\s*display:\s*none;/)
    expect(template).toMatch(/\.media\s*\{[^}]*pointer-events:\s*none;/)
    expect(template).toMatch(/\.media\s*\{[^}]*object-fit:\s*contain;/)
  })

  it("names every slot's asset among the keys the build looks for", () => {
    const keys = landingMediaKeys()
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) expect(page).toContain(`data-asset="${key}"`)
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

  it("carries no script and links nowhere but GitHub, mail and its own PDF", () => {
    const html = page + renderLandingHead()
    expect(html).not.toMatch(/<script/i)
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
    expect(renderLanding(resume, "", words)).toContain(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
    )
  })
})
