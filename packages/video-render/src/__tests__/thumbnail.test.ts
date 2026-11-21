/**
 * An episode's thumbnail (EPISODES3, C1026): its title is made from the
 * episode's facts by its genre's rule, who speaks is read from the cut
 * list, the title is fitted at the largest size its box takes and refused
 * where only an unreadable size would fit, and the page is the same text
 * for the same inputs. The bytes a browser draws from it are held by the
 * recorder's spec (apps/www/tests/record/thumbnail.spec.ts).
 */
import { GENRE_PAINT, GENRES } from "@some-ui/styles/brand/genres"
import { cutList, shot } from "@video-render/testing"
import {
  BAND_PX,
  chooseTitleSize,
  LEAST_READABLE_PX,
  THUMBNAIL,
  thumbnailInput,
  thumbnailPage,
  thumbnailTitle,
  TITLE_FIT,
  titleSizes,
  voicesOf,
} from "@video-render/thumbnail"
import type { ThumbnailFacts, ThumbnailVoices } from "@video-render/thumbnail"
import { describe, expect, it } from "vitest"

const FONTS = {
  title: "data:font/woff2;base64,AA",
  label: "data:font/woff2;base64,AB",
}

const take = { file: "01.wav", inMs: 0, outMs: 1000 }

describe("thumbnailTitle", () => {
  it.each<[ThumbnailFacts, string]>([
    [
      { genre: "call", from: "2026-10-30", to: "2026-11-05", part: 1, of: 1 },
      "The week of Oct 30 – Nov 5",
    ],
    [
      { genre: "call", from: "2026-11-06", to: "2026-11-12", part: 2, of: 3 },
      "The week of Nov 6 – 12, part 2 of 3",
    ],
    [
      {
        genre: "cards-essay",
        title: "NixOS: how this machine upgrades itself",
      },
      "NixOS: how this machine upgrades itself",
    ],
    [
      { genre: "interview-essay", role: "Full-stack engineer, driver tools" },
      "Full-stack engineer, driver tools",
    ],
    [
      { genre: "playoff-delta", season: "2025", week: 12 },
      "Week 12, 2025 season",
    ],
    [
      { genre: "playoff-delta", season: "2025", week: "legend" },
      "The legend: how to read a week",
    ],
    [{ genre: "report", week: "2026-W47" }, "The week of Nov 16"],
    [
      { genre: "call", from: "2026-12-28", to: "2027-01-03", part: 1, of: 1 },
      "The week of Dec 28 – Jan 3",
    ],
    [{ genre: "rust-essay", week: "2026-W05", firstTicket: "A" }, "Week 5: A"],
    [
      {
        genre: "rust-essay",
        week: "2026-w46",
        firstTicket: "Parse the batch without a copy per field",
      },
      "Week 46: Parse the batch without a copy per field",
    ],
    [{ genre: "rust-essay", week: "2026-w46", firstTicket: null }, "Week 46"],
  ])("makes %j's title", (facts, title) => {
    expect(thumbnailTitle(facts)).toBe(title)
  })

  it("draws the title its facts make, the genre they name and who speaks", () => {
    expect(
      thumbnailInput(
        { genre: "report", week: "2026-W47" },
        cutList([shot("a", { take, speaker: "kokoro" })])
      )
    ).toEqual({
      genre: "report",
      title: "The week of Nov 16",
      voices: "synthetic",
    })
  })
})

describe("voicesOf", () => {
  it.each<[string, Parameters<typeof cutList>[0], ThumbnailVoices]>([
    ["a speaker's take", [shot("a", { take, speaker: "kokoro" })], "synthetic"],
    ["the owner's take", [shot("a", { take })], "owner"],
    [
      "both",
      [shot("a", { take, speaker: "kokoro" }), shot("b", { take })],
      "both",
    ],
    ["no take", [shot("a")], "silent"],
    [
      "a spoken card's turns",
      [
        shot("a", {
          spoken: {
            role: "spoken",
            category: "introduction",
            exchanges: [
              {
                ask: { voice: "kokoro", said: "Who are you?" },
                answer: { voice: "owner", take: "take-1" },
              },
            ],
          },
        }),
      ],
      "both",
    ],
  ])("reads %s", (_, shots, voices) => {
    expect(voicesOf(cutList(shots))).toBe(voices)
  })
})

describe("the title's fit", () => {
  it("tries only sizes that read at 320×180, largest first", () => {
    const sizes = titleSizes()
    expect(sizes[0]).toBe(TITLE_FIT.maxPx)
    expect(sizes.at(-1)).toBe(TITLE_FIT.minPx)
    expect(sizes.every((px) => px * THUMBNAIL.small >= LEAST_READABLE_PX)).toBe(
      true
    )
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes)
  })

  it("says who speaks in letters that read at 320×180", () => {
    expect(BAND_PX.main * THUMBNAIL.small).toBeGreaterThanOrEqual(
      LEAST_READABLE_PX
    )
  })

  it("takes the largest size that stays inside the box", () => {
    const measured = titleSizes().map((px) => ({
      px,
      width: TITLE_FIT.width,
      height: px * 4,
    }))
    const fit = chooseTitleSize("t", measured)
    expect(fit).toEqual({
      ok: true,
      value: Math.max(
        ...measured.filter((m) => m.height <= TITLE_FIT.height).map((m) => m.px)
      ),
    })
  })

  it("refuses a title too tall or too wide at every readable size", () => {
    const tall = titleSizes().map((px) => ({
      px,
      width: 10,
      height: TITLE_FIT.height + 1,
    }))
    const wide = titleSizes().map((px) => ({
      px,
      width: TITLE_FIT.width + 1,
      height: 10,
    }))
    for (const measured of [tall, wide]) {
      const fit = chooseTitleSize("A word too long", measured)
      expect(fit.ok).toBe(false)
      if (!fit.ok) expect(fit.problems[0]).toContain("A word too long")
    }
  })

  it("refuses a title in letters the font can't draw, at any size", () => {
    const fits = titleSizes().map((px) => ({ px, width: 10, height: 10 }))
    for (const title of ["한국어 주간", "Dvořák", "Łódź", "a\u0085b"])
      expect(chooseTitleSize(title, fits).ok, title).toBe(false)
    for (const title of ["Café – “quoted” … €5", "Œuvre™ − 2 ↑", "Ångström ñ"])
      expect(chooseTitleSize(title, fits).ok, title).toBe(true)
  })

  it("refuses a fit only an unreadable size gives", () => {
    const tiny = [{ px: TITLE_FIT.minPx - 2, width: 10, height: 10 }]
    expect(chooseTitleSize("t", tiny).ok).toBe(false)
  })
})

describe("thumbnailPage", () => {
  const input = {
    genre: "rust-essay",
    title: "The Rust Rounds essay, 2026-w46",
    voices: "both",
  } as const

  it("is the same text for the same inputs", () => {
    expect(thumbnailPage(input, FONTS)).toBe(thumbnailPage(input, FONTS))
  })

  it("reaches nothing outside itself", () => {
    const page = thumbnailPage(input, FONTS)
    const urls = [...page.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1] ?? "")
    expect(urls.every((u) => u.startsWith("data:") || u.startsWith("#"))).toBe(
      true
    )
    expect(page).not.toMatch(/\b(src|href)=/)
  })

  it.each(GENRES)("paints %s's band in its hue", (genre) => {
    const page = thumbnailPage({ ...input, genre }, FONTS)
    expect(page).toContain(`background:${GENRE_PAINT[genre].hue}`)
  })

  it.each<[ThumbnailVoices, boolean, boolean]>([
    ["synthetic", true, false],
    ["both", true, true],
    ["owner", false, true],
    ["silent", false, false],
  ])("for %s, draws the bird %s and the mochi %s", (voices, bird, mochi) => {
    const page = thumbnailPage({ ...input, voices }, FONTS)
    expect(page.includes("tin-owlet-")).toBe(bird)
    expect(page.includes("mochi-")).toBe(mochi)
    expect(page).toContain(`data-voices="${voices}"`)
  })

  it("escapes the title", () => {
    expect(thumbnailPage({ ...input, title: "a <b> & c" }, FONTS)).toContain(
      "a &lt;b&gt; &amp; c"
    )
  })
})
