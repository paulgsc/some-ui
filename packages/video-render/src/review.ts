/**
 * What a review render carries for the phone's Watch (STUDIO ST5): which
 * video and revision it is (its title and revision; the phone checks both,
 * and the scenes, against its own copy) and where each scene plays in it,
 * written beside the video as `review.json`. A note made while watching is pinned by these times to
 * (revision, scene, offset), so it follows its scene into later revisions.
 */
import { z } from "zod"

import type { CutList, Parsed } from "./cut-list"
import { problemsOf } from "./cut-list"
import type { ShotTime } from "./timing"

export const REVIEW_SCHEMA = "some-ui.studio-review/1"

export type Review = {
  readonly schema: typeof REVIEW_SCHEMA
  readonly title: string
  readonly rev: number
  readonly shotTimes: ReadonlyArray<ShotTime>
}

const ms = z.number().int().nonnegative()

const ReviewSchema = z.object({
  schema: z.literal(REVIEW_SCHEMA),
  title: z.string().min(1),
  rev: z.number().int().positive(),
  shotTimes: z
    .array(
      z.object({
        id: z.string().min(1),
        cut: z.string().min(1).nullable(),
        startMs: ms,
        durationMs: ms,
      })
    )
    .min(1),
})

/** The review of `cutList` as rendered; null when it names no revision. */
export function reviewOf(
  cutList: Pick<CutList, "revisions" | "title">,
  shotTimes: ReadonlyArray<ShotTime>
): Review | null {
  const rev = cutList.revisions.at(-1)?.rev
  return rev === undefined
    ? null
    : { schema: REVIEW_SCHEMA, title: cutList.title, rev, shotTimes }
}

/** The review in `source`, or every reason it can't be read. */
export function readReview(source: string): Parsed<Review> {
  let raw: unknown
  try {
    raw = JSON.parse(source)
  } catch {
    return { ok: false, problems: ["not JSON"] }
  }
  const parsed = ReviewSchema.safeParse(raw)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problems: problemsOf(parsed.error, "review") }
}
