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
  copyRing,
  cubeRing,
  CUBES,
  escapeHtml,
  landingMediaKeys,
  PHOTO,
  renderLanding,
  renderLandingHead,
  ringCss,
  TYPE_S,
  typeCss,
  WIDE_MOTION,
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
    const [clip] = LANDING_WORDS.projects
    const [still] = LANDING_WORDS.gaps
    const shown = renderLanding(resume, mochiSvg(), LANDING_WORDS, MEDIA)
    expect(shown).toContain(
      `<video class="media" src="${SITE_BASE}media/${clip.media}"`
    )
    expect(shown).toContain(`<img src="${SITE_BASE}media/${PHOTO}"`)
    expect(shown).not.toContain(`d="${MOCHI_BODY}"`)
    expect(shown).not.toContain(escapeHtml(still.visualNote))
    // A face shows its asset by its key, a still as an image: Page Filter's
    // face and its gap's card both show the one still the build carries.
    const stillTag = `<img class="media" src="${SITE_BASE}media/${still.visual}"`
    const faces = LANDING_WORDS.projects.filter((p) => p.media === still.visual)
    expect(faces.length).toBeGreaterThan(0)
    expect(shown.split(stillTag).length - 1).toBe(faces.length * CUBES + 1)
    for (const p of LANDING_WORDS.projects)
      if (!MEDIA.has(p.media)) expect(shown).not.toContain(`media/${p.media}`)
    expect(page).not.toMatch(/<video|<img/)
  })

  /**
   * What each cube shows at time `t`, read from the page as a browser would
   * run it: a cube's turn runs `t - delay` into its cycle, rests on face k,
   * then shows k and k + 1 while it turns.
   */
  const fronts = (
    html: string,
    faces: number,
    t: number
  ): Array<Set<string>> => {
    const ring = cubeRing(faces)
    const slot = ring.restS + ring.turnS
    const cycle = slot * faces
    return [
      ...html.matchAll(
        /<div class="ring-turn" style="animation-delay: (-?[\d.]+)s">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g
      ),
    ].map((m) => {
      const assets = [
        ...m[2].matchAll(/<article class="face"[^>]*data-asset="([^"]+)"/g),
      ].map((f) => f[1])
      const u = (((t - Number(m[1])) % cycle) + cycle) % cycle
      const k = Math.floor(u / slot) % faces
      const shown = new Set([assets[k]])
      if (u % slot > ring.restS) shown.add(assets[(k + 1) % faces])
      return shown
    })
  }

  it("never shows one project on both cubes at once, resting or turning (C1112)", () => {
    for (const n of [3, 4, 5]) {
      const projects = Array.from({ length: n }, (_, i) => ({
        ...LANDING_WORDS.projects[i % LANDING_WORDS.projects.length],
        media: `clips/p${String(i)}.mp4` as const,
      }))
      const html = renderLanding(resume, mochiSvg(), {
        ...LANDING_WORDS,
        projects,
      })
      const cycle = (cubeRing(n).restS + cubeRing(n).turnS) * n
      for (let t = 0; t < 2 * cycle; t += 0.05) {
        const shown = fronts(html, n, t)
        expect(shown).toHaveLength(CUBES)
        const [a, b] = shown
        expect([...a].filter((x) => b.has(x))).toEqual([])
      }
    }
    // Every cube carries every project; only the first is read out.
    const all = LANDING_WORDS.projects.map((p) => p.media).sort()
    const carried = [
      ...page.matchAll(
        /<div class="ring-turn" style="animation-delay: -?[\d.]+s">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g
      ),
    ].map((m) =>
      [...m[1].matchAll(/<article class="face"[^>]*data-asset="([^"]+)"/g)]
        .map((f) => f[1])
        .sort()
    )
    expect(carried).toEqual(Array.from({ length: CUBES }, () => all))
    expect(page).toContain('<div class="block block--cube" data-cube="0">')
    expect(page).toContain(
      '<div class="block block--cube" data-cube="1" aria-hidden="true">'
    )
  })

  it("draws every ring's turn and its titles' typing in the head, CSS alone", () => {
    const head = renderLandingHead()
    const copy = copyRing(LANDING_WORDS.copy.length)
    const cube = cubeRing(LANDING_WORDS.projects.length)
    expect(copy.axis).toBe("y")
    expect(cube.axis).toBe("x")
    expect(head).toContain(ringCss(copy))
    expect(head).toContain(ringCss(cube))
    expect(head).toContain(typeCss(cube))
    expect(page).toContain('class="ring ring--copy" data-axis="y"')
    expect(page).toContain('class="ring ring--cube" data-axis="x"')
    for (const c of LANDING_WORDS.copy)
      expect(page).toContain(escapeHtml(c.headline))
  })

  it("names every turn and every typing only where the showcase moves", () => {
    const head = renderLandingHead()
    const outside = head.replace(
      new RegExp(
        `@media ${WIDE_MOTION.replace(/[()]/g, "\\$&")} \\{[^{}]*\\{[^{}]*\\} \\}`,
        "g"
      ),
      ""
    )
    for (const name of ["turn-copy", "turn-cube", "type-cube"])
      expect(head).toContain(`animation-name: ${name};`)
    expect(outside).not.toMatch(/animation(-name)?\s*:/)
  })

  it("rests on each face, turns a face's angle, and ends where it began", () => {
    const ring = {
      name: "cube",
      faces: 4,
      axis: "x",
      restS: 6,
      turnS: 2,
    } as const
    const css = ringCss(ring)
    expect(css).toContain(
      "@keyframes turn-cube { 0%, 18.75% { transform: translateZ(calc(-1 * var(--depth))) rotateX(0deg); }"
    )
    expect(css).toContain(
      "25%, 43.75% { transform: translateZ(calc(-1 * var(--depth))) rotateX(90deg); }"
    )
    expect(css).toContain(
      "100% { transform: translateZ(calc(-1 * var(--depth))) rotateX(360deg); } }"
    )
    expect(css).toContain(".ring--cube { --faces: 4; --cycle: 32s; }")
    expect(ringCss({ ...ring, axis: "y", faces: 3 })).toContain(
      "rotateY(-240deg)"
    )
    expect(() => ringCss({ ...ring, faces: 2 })).toThrow(/three faces/)
    expect(typeCss(ring)).toContain(
      `${String(Number(((TYPE_S / 32) * 100).toFixed(3)))}%, 100% { clip-path: inset(0 0 0 0); }`
    )
  })

  it("types each title as its face comes round, a step a character", () => {
    const cube = cubeRing(LANDING_WORDS.projects.length)
    const slot = cube.restS + cube.turnS
    const cycle = slot * cube.faces
    const cubesHtml = [
      ...page.matchAll(
        /<div class="ring-turn" style="animation-delay: (-?[\d.]+)s">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g
      ),
    ]
    expect(cubesHtml).toHaveLength(CUBES)
    for (const [, ringDelay, faces] of cubesHtml) {
      const typed = [
        ...faces.matchAll(
          /style="--i: (\d+);[^"]*"[\s\S]*?<span class="typed" style="animation-delay: (-?[\d.]+)s; animation-timing-function: steps\((\d+), end\)">([^<]+)<\/span>/g
        ),
      ]
      expect(typed).toHaveLength(LANDING_WORDS.projects.length)
      for (const [, position, delay, steps, title] of typed) {
        // A title starts typing when its face arrives: its ring's delay
        // plus its position's slots, in the same cycle.
        const off =
          (((Number(delay) - Number(ringDelay) - Number(position) * slot) %
            cycle) +
            cycle) %
          cycle
        expect(Math.min(off, cycle - off)).toBeLessThan(0.01)
        expect(Number(delay)).toBeLessThanOrEqual(0)
        expect(Number(steps)).toBe([...title].length)
      }
    }
  })

  it("puts every card's words below its picture, never over it (C1110)", () => {
    const shown = renderLanding(resume, mochiSvg(), LANDING_WORDS, MEDIA)
    const cards = [...shown.matchAll(/<article\b[\s\S]*?<\/article>/g)].map(
      (m) => m[0]
    )
    expect(cards).toHaveLength(
      LANDING_WORDS.projects.length * CUBES + LANDING_WORDS.gaps.length
    )
    for (const card of cards) {
      const picture = Math.max(
        card.indexOf('<div class="screen">'),
        card.indexOf('<div class="pic">')
      )
      const words = Math.min(
        ...['<div class="band"', '<div class="caption">']
          .map((w) => card.indexOf(w))
          .filter((at) => at > -1)
      )
      expect(picture).toBeGreaterThan(-1)
      expect(words).toBeGreaterThan(picture)
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
    expect(videos).toHaveLength(CUBES)
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

  it("gives each face, laid flat, its picture's own shape, and its placeholder's without one", () => {
    const [clip, , other] = LANDING_WORDS.projects
    const shown = renderLanding(resume, mochiSvg(), LANDING_WORDS, MEDIA)
    const style = (key: string): string =>
      new RegExp(
        `class="face"[^>]*data-asset="${key}" style="--i: \\d+; ([^"]+)"`
      ).exec(shown)?.[1] ?? ""
    expect(style(clip.media)).toBe("--ar: 1080 / 1920; --r: 0.5625")
    expect(style(other.media)).toBe("--ar: 4 / 3; --r: 1.3333")
  })

  it("puts no link or control on a card: the page's header leads to the code", () => {
    const shown = renderLanding(resume, mochiSvg(), LANDING_WORDS, MEDIA)
    const cards = [...shown.matchAll(/<article\b[\s\S]*?<\/article>/g)]
    for (const [card] of cards)
      expect(card).not.toMatch(/<a\b|<button|controls/)
  })

  it("turns, types and breathes only on a wide screen with motion allowed", () => {
    const template = readFileSync(
      join(import.meta.dirname, "../../../landing/index.html"),
      "utf8"
    )
    const css = template.slice(template.indexOf("<style>"))
    const wide = `@media ${WIDE_MOTION} {`
    const start = css.indexOf(wide)
    expect(start).toBeGreaterThan(-1)
    // The block ends where the next top-level rule starts.
    const end = css.indexOf("\n      }\n", start)
    const outside = css.slice(0, start) + css.slice(end)
    // Outside the wide block nothing is set moving: the only transform is
    // the breathing keyframe's, which only the wide block runs.
    expect(outside).not.toMatch(/\banimation(-name)?:/)
    expect(
      outside.match(/(^|\s)transform:[^;]*/gm)?.map((t) => t.trim())
    ).toEqual(["transform: scale(1.015)"])
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*video\.media\s*\{\s*display:\s*none;/
    )
    expect(css).toMatch(/\.media\s*\{[^}]*pointer-events:\s*none;/)
    expect(css).toMatch(/\.media\s*\{[^}]*object-fit:\s*contain;/)
  })

  it("names every slot's asset once among the keys the build looks for", () => {
    const keys = landingMediaKeys()
    // A still on a face and on a gap's card is one key: the build carries it once.
    expect(keys.filter((k) => k === LANDING_WORDS.gaps[0].visual)).toHaveLength(
      1
    )
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
