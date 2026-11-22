/**
 * The landing (PAGES, #3401): what the public site's front page says, read
 * from `renderLanding` on the résumé's real data, so a change to either shows
 * here.
 */
import { resumeData } from "@some-ui/resume"
import { MOCHI_BODY } from "@some-ui/styles/brand/mark"
import { describe, expect, it } from "vitest"

import { mochiSvg } from "./mochi"
import { escapeHtml, renderLanding, renderLandingHead } from "./render"
import { LANDING_WORDS } from "./words"

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
    expect(page).toContain('data-asset="photo/portrait.webp"')
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
