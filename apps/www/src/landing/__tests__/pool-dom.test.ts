/**
 * @vitest-environment jsdom
 */
/**
 * A pool's draw on the page (#3473, C1440): every place a drawn snack fills
 * shows that snack's own copy and faces, whole, and nothing of the first
 * draw the page was built with, on the stage, the cubes, the list and the
 * skeletons.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { drawSnacks } from "@/landing/draw"
import { landingMochi } from "@/landing/mochi"
import { drawPools } from "@/landing/pool-dom"
import type { LandingMedia } from "@/landing/render"
import { landingMediaKeys, previewKey, renderLanding } from "@/landing/render"
import { SHOW, showFor } from "@/landing/show"
import { LANDING_WORDS } from "@/landing/words"
import { resumeData } from "@some-ui/resume"
import { describe, expect, it } from "vitest"

const ROOT = join(import.meta.dirname, "../../../../..")
const resolved = showFor(
  SHOW,
  (path): unknown => JSON.parse(readFileSync(join(ROOT, path), "utf8")),
  true
)
if (!resolved.ok) throw new Error(resolved.problems.join("; "))
const EPISODES = resolved.episodes
// Every face's asset carried, with its preview, so every place holds a
// clip or still and a preview to go stale.
const MEDIA: LandingMedia = new Map(
  landingMediaKeys(LANDING_WORDS, EPISODES).map((key) => [
    key,
    { width: 1080, height: 1920, preview: previewKey(key) },
  ])
)

/** Whether `src` is `key`'s asset or its preview, as the page serves them. */
const isOwn = (src: string | null, key: string): boolean =>
  src !== null &&
  (src.endsWith(`/${key}`) || src.endsWith(`/${previewKey(key)}`))
const PAGE = renderLanding(
  resumeData.fullstack,
  landingMochi(),
  LANDING_WORDS,
  MEDIA,
  EPISODES
)

const pooled = EPISODES.filter((e) => e.pool !== null)

describe("drawPools", () => {
  for (const seed of [1, 2, 3, 5, 8, 13, 21, 34]) {
    it(`puts each drawn snack whole in its place, nothing of the built draw left (seed ${String(seed)})`, () => {
      document.body.innerHTML = PAGE
      drawPools(seed)
      for (const episode of pooled) {
        const pool = episode.pool
        if (pool === null) continue
        const drawn = drawSnacks(
          episode.id,
          pool.snacks.length,
          pool.draw,
          seed
        )
        const id = episode.id
        const copy = [
          ...document.querySelectorAll(`.copy[data-copy="${id}"] .scene`),
        ]
        const cubes = [
          ...document.querySelectorAll(
            `.pair[data-episode="${id}"] .ring-turn`
          ),
        ].map((t) => [...t.children].filter((c) => c.matches(".face")))
        const list = [
          ...document.querySelectorAll(
            `.episode[data-episode="${id}"] .scene-flat`
          ),
        ]
        drawn.forEach((index, place) => {
          const snack = pool.snacks.at(index)
          if (snack === undefined) throw new Error("no snack")
          expect(
            copy[place]?.querySelector(".scene-title span")?.textContent
          ).toBe(snack.title)
          const lines = [...(copy[place]?.querySelectorAll(".line") ?? [])].map(
            (l) => l.textContent
          )
          expect(lines.filter((l) => l !== "")).toEqual(snack.narration)
          expect(list[place]?.querySelector("h4")?.textContent).toBe(
            snack.title
          )
          // The list's scene holds the snack's lines and no other.
          expect(
            [
              ...(list.at(place)?.querySelectorAll(".scene-copy > h4 ~ p") ??
                []),
            ].map((p) => p.textContent)
          ).toEqual(snack.narration)
          snack.faces.forEach((face, j) => {
            const places = [
              cubes.at(j)?.at(place),
              [...(list.at(place)?.querySelectorAll(".card") ?? [])].at(j),
            ]
            for (const at of places) {
              if (at === undefined) throw new Error("no place")
              expect(at.getAttribute("data-asset")).toBe(face.key)
              expect(at.getAttribute("data-slot")).toBe(face.slot)
              // Every picture in the place is this face's, or its preview.
              for (const media of at.querySelectorAll("[src]"))
                expect(isOwn(media.getAttribute("src"), face.key)).toBe(true)
              const label =
                at.querySelector(".band-title span") ??
                at.querySelector(".caption p")
              expect(label?.textContent).toBe(face.label)
            }
            if (place === 0) {
              const skeleton = [
                ...document.querySelectorAll(
                  `.skeletons[data-episode="${id}"] .skeleton`
                ),
              ].at(j)
              expect(skeleton?.getAttribute("data-skeleton")).toBe(face.slot)
              // Whole: the drawn snack's own skeleton, its preview included.
              const template = document.querySelector<HTMLTemplateElement>(
                `template.pool[data-episode="${id}"]`
              )
              const own = [
                ...([...(template?.content.querySelectorAll(".snack") ?? [])]
                  .at(index)
                  ?.querySelectorAll(".skeleton") ?? []),
              ].at(j)
              expect(own).toBeDefined()
              expect(skeleton?.outerHTML).toBe(own?.outerHTML)
              const previews = [...(skeleton?.querySelectorAll("img") ?? [])]
              expect(previews.length).toBeGreaterThan(0)
              for (const img of previews)
                expect(isOwn(img.getAttribute("src"), face.key)).toBe(true)
            }
          })
        })
      }
    })
  }
})
