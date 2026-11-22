/**
 * An episode's thumbnail in CI (EPISODES3, C1026): drawn through the
 * recorders' own path (`./thumbnail`), every genre and every case of who
 * speaks gives a 1280×720 PNG, the same bytes when drawn twice; a title that
 * fits only at a size unreadable at 320×180 is refused, not drawn.
 *
 * Needs only the browser: the page and its fonts are made in-process.
 */

import { createHash } from "node:crypto"
import { expect, test } from "@playwright/test"
import { GENRES } from "@some-ui/styles/brand/genres"
import type {
  ThumbnailInput,
  ThumbnailVoices,
} from "@some-ui/video-render/thumbnail"

import { drawThumbnail } from "./thumbnail"

const VOICES: ReadonlyArray<ThumbnailVoices> = [
  "synthetic",
  "both",
  "owner",
  "silent",
]

const sha = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex")

/** A PNG's width and height, from its header. */
const sizeOf = (png: Buffer): { width: number; height: number } => ({
  width: png.readUInt32BE(16),
  height: png.readUInt32BE(20),
})

const INPUTS: ReadonlyArray<ThumbnailInput> = GENRES.flatMap((genre, i) => [
  {
    genre,
    title: "NixOS: how this machine upgrades itself",
    voices: VOICES[i % VOICES.length] ?? "synthetic",
  },
  {
    genre,
    title:
      "The weekly call, 2026-10-30 to 2026-11-05: twenty-two items open, and every one waits on me",
    voices: "both",
  },
])

test("every thumbnail is a 1280×720 PNG, the same bytes twice", async ({
  browser,
}) => {
  for (const input of INPUTS) {
    const first = await drawThumbnail(browser, input)
    const second = await drawThumbnail(browser, input)
    if (!first.ok || !second.ok)
      throw new Error(`${input.genre}: ${JSON.stringify([first, second])}`)
    expect(sizeOf(first.value)).toEqual({ width: 1280, height: 720 })
    expect(sha(second.value), `${input.genre}, ${input.voices}`).toBe(
      sha(first.value)
    )
  }
})

test("a title only an unreadable size would fit is refused", async ({
  browser,
}) => {
  const drawn = await drawThumbnail(browser, {
    genre: "cards-essay",
    title: Array.from({ length: 40 }, () => "words").join(" "),
    voices: "synthetic",
  })
  expect(drawn.ok).toBe(false)
  const word = await drawThumbnail(browser, {
    genre: "cards-essay",
    title: "Supercalifragilisticexpialidociouslyunbreakableword",
    voices: "synthetic",
  })
  expect(word.ok).toBe(false)
})
