/**
 * The sound kit (HYPER4, #2727): the six sounds the renderer names, kept on
 * home in `${STORAGE}/brand/sounds/`, never in a repository. Beside the files
 * is the owner's record of them, `kit.json`: which file is which sound, and
 * where it came from under which licence. `motion kit` reads it, refuses a
 * sound that is not CC0 or not audio, and prints the series' `sounds`, each
 * pinned by its sum, for a new series version to carry.
 */

import { SOUNDS } from "@some-ui/video-render"
import type { Sound } from "@some-ui/video-render"
import { z } from "zod"

export const KIT_SCHEMA = "some-ui.sound-kit/1"

/** The only licence a kit sound may carry: CC0 1.0, given as its SPDX id. */
const KIT_LICENCE = "CC0-1.0"

/** Where a kit file lands in a video's folder, by its own name. */
const KIT_DIR = "kit"

/** A cue is a moment, not a bed: anything longer is the wrong file. */
const LONGEST_MS = 4000

const FileName = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:wav|ogg|flac|mp3)$/, {
    message:
      "is a file name in the kit's folder, ending .wav, .ogg, .flac or .mp3",
  })

export const KitSchema = z.object({
  schema: z.literal(KIT_SCHEMA),
  sounds: z.partialRecord(
    z.enum(SOUNDS),
    z.object({
      file: FileName,
      /** The page the file was taken from. */
      source: z.url({ protocol: /^https$/ }),
      licence: z.string(),
    })
  ),
})
export type Kit = z.infer<typeof KitSchema>

/** What `motion kit` learned of one file. */
export type Heard = {
  readonly sha256: string | null
  /** Its length, or null when ffprobe can't read it. */
  readonly durationMs: number | null
  /** Whether it has a picture too (a cover image, a video stream). */
  readonly picture: boolean
}

export type Checked =
  | {
      readonly ok: true
      /** The series' `sounds`, as a new version carries them. */
      readonly sounds: Partial<Record<Sound, { file: string; sha256: string }>>
      /** One line a sound, for the issue: name, file, sum, source, licence. */
      readonly record: ReadonlyArray<string>
    }
  | { readonly ok: false; readonly problems: ReadonlyArray<string> }

/** The kit checked against what was heard of each file. */
export function checkKit(kit: Kit, heard: ReadonlyMap<string, Heard>): Checked {
  const problems: Array<string> = []
  const sounds: Partial<Record<Sound, { file: string; sha256: string }>> = {}
  const record: Array<string> = []
  for (const sound of SOUNDS) {
    const entry = kit.sounds[sound]
    if (!entry) {
      problems.push(`${sound}: the kit names no file`)
      continue
    }
    if (entry.licence !== KIT_LICENCE) {
      problems.push(
        `${sound}: ${entry.file} is licensed ${entry.licence}, and the kit takes only ${KIT_LICENCE}`
      )
    }
    const h = heard.get(entry.file)
    if (typeof h?.sha256 !== "string") {
      problems.push(`${sound}: ${entry.file} is not in the kit's folder`)
      continue
    }
    if (h.durationMs === null || h.durationMs <= 0) {
      problems.push(`${sound}: ${entry.file} is not a sound ffprobe can read`)
      continue
    }
    if (h.picture) {
      problems.push(
        `${sound}: ${entry.file} has a picture as well, and the kit takes sound alone`
      )
      continue
    }
    if (h.durationMs > LONGEST_MS) {
      problems.push(
        `${sound}: ${entry.file} lasts ${String(h.durationMs)} ms, longer than a cue's ${String(LONGEST_MS)}`
      )
      continue
    }
    sounds[sound] = { file: `${KIT_DIR}/${entry.file}`, sha256: h.sha256 }
    record.push(
      `${sound}: ${entry.file}, ${h.sha256}, ${String(h.durationMs)} ms, from ${entry.source}, ${entry.licence}`
    )
  }
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, sounds, record }
}
