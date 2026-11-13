/**
 * What pins an episode of a show (SHOW SH2, #2527): its show, format
 * version, period and data, and its upload's copy within YouTube's limits
 * (`UploadCopySchema`, SH5). A Studio project a phone opened from an episode
 * file keeps its pin (`EpisodePin`), and home's DNA of it carries the pin.
 * Studio opens no episode file: home makes and voices each episode, and
 * `EPISODE_SCHEMA` is how a picked file is told to be one. The file itself is
 * written and read only by tests (`./episode-file`, on `./testing`).
 */

import { z } from "zod"

import { words } from "./format"
import { Sha256Schema } from "./vocabulary"

export const EPISODE_SCHEMA = "some-ui.show-episode/1"

/** YouTube's limits on an upload's title: in characters, as YouTube counts them. */
export const UPLOAD_TITLE_MAX_CHARS = 100

/** YouTube's limit on an upload's description, in bytes of UTF-8. */
export const UPLOAD_DESCRIPTION_MAX_BYTES = 5_000

/** YouTube refuses either character in a title or a description. */
const NO_ANGLES = /^[^<>]*$/

/**
 * What an upload says on YouTube, as its show fills it: a title and a
 * description within YouTube's limits, with no `<` or `>`.
 */
export const UploadCopySchema = z.object({
  title: words
    .regex(NO_ANGLES, "YouTube refuses < and > in a title")
    .refine((title) => [...title].length <= UPLOAD_TITLE_MAX_CHARS, {
      message: `a title has at most ${UPLOAD_TITLE_MAX_CHARS} characters`,
    }),
  description: words
    .regex(NO_ANGLES, "YouTube refuses < and > in a description")
    .refine(
      (text) =>
        new TextEncoder().encode(text).length <= UPLOAD_DESCRIPTION_MAX_BYTES,
      {
        message: `a description has at most ${UPLOAD_DESCRIPTION_MAX_BYTES} bytes`,
      }
    ),
})

export type UploadCopy = z.infer<typeof UploadCopySchema>

/** What pins an episode: its show, its format version, its period and its data. */
export const EpisodePinSchema = z.object({
  schema: z.literal(EPISODE_SCHEMA),
  /** The show it is an episode of, as the phone names it: "Playoff Delta". */
  show: words,
  format: z.object({ id: words, version: z.number().int() }),
  /** Which period it is: "2026 week 7". */
  period: words,
  /** The data it read: where it came from, and a sum its `source` names. */
  data: z.object({
    source: words,
    sha256: Sha256Schema,
  }),
  /** The upload's copy, filled from the period's data; absent before SH5. */
  upload: UploadCopySchema.optional(),
})

export type EpisodePin = z.infer<typeof EpisodePinSchema>
