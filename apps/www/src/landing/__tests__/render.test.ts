/**
 * The landing (PAGES, #3401): what the public site's front page says, read
 * from `renderLanding` on the résumé's real data, so a change to either shows
 * here.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { mochiSvg } from "@/landing/mochi"
import { SITE_BASE } from "@/landing/output"
import {
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
      expect(page).toContain(`data-asset="${p.clip}"`)
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
    const media = new Set([PHOTO, clip.clip, still.visual])
    const shown = renderLanding(resume, mochiSvg(), LANDING_WORDS, media)
    expect(shown).toContain(`src="${SITE_BASE}media/${clip.clip}"`)
    expect(shown).toContain(
      `<img class="media" src="${SITE_BASE}media/${still.visual}"`
    )
    expect(shown).toContain(`<img src="${SITE_BASE}media/${PHOTO}"`)
    expect(shown).not.toContain(`d="${MOCHI_BODY}"`)
    expect(shown).not.toContain(escapeHtml(still.visualNote))
    for (const p of rest) expect(shown).toContain(`title-card--${p.id}`)
    expect(page).not.toMatch(/<video|<img/)
  })

  it("lays a clip behind the card as its background, never a player (C1064)", () => {
    const [clip] = LANDING_WORDS.projects
    const [still] = LANDING_WORDS.gaps
    const shown = renderLanding(
      resume,
      mochiSvg(),
      LANDING_WORDS,
      new Set([clip.clip, still.visual])
    )
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
    // The placeholder stays under the clip, for a reader who prefers less
    // motion, and the card's own words carry its title.
    const card = shown.slice(shown.indexOf(`data-asset="${clip.clip}"`))
    expect(card.indexOf(`title-card--${clip.id}`)).toBeLessThan(
      card.indexOf("<video")
    )
    expect(card).toContain(`<h3>${escapeHtml(clip.title)}</h3>`)
    expect(shown).toMatch(
      /<img class="media" src="[^"]+" alt="" aria-hidden="true" \/>/
    )
  })

  it("hides every moving clip from a reader who prefers less motion", () => {
    const template = readFileSync(
      join(import.meta.dirname, "../../../landing/index.html"),
      "utf8"
    )
    expect(template).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*video\.media\s*\{\s*display:\s*none;/
    )
    expect(template).toMatch(/\.media\s*\{[^}]*pointer-events:\s*none;/)
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
