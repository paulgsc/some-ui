/**
 * Studio's videos queued on home to be made, as their DNA (paulgsc/server
 * `routes/studio_videos.rs` and `handlers/studio_videos.rs`; STUDIO ST33,
 * #2591). The phone sends each revision Finish kept for home with
 * `PUT /studio/videos/:video/queued/:rev` and reads where each stands with
 * `GET /studio/videos` (`apps/www/src/lib/home-link/videos.ts`) through the
 * app's home link.
 *
 * Hand-written: `VideosSchema` is the server's `studio_video_repo::Videos`
 * (its `Queued`), checked by hand against it. Both routes are
 * subject-scoped (`SubjectId`), so a cookie session reaches them as a paired
 * phone's bearer does: each has a signed-out contract, which always runs,
 * and a `session` contract.
 *
 * **Nothing here keeps anything.** A queued video is append-only and goes
 * only with the account, so no probe may queue one: the write is pinned by
 * the refusals home makes before it writes, each in the error envelope the
 * phone reads (`lib/home-link/keyed-send.ts`): a DNA whose video is not the
 * path's, a `422` naming the field, and a DNA naming a take home doesn't
 * hold, a `409` `conflict` naming each note under `details.notes`. The
 * `200` of a real queue, `unchanged` on a repeat, and a `409` naming no
 * note for other bytes under a queued revision are held by the server's
 * own handler tests.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

/** `studio_video_repo::VIDEOS_LISTED`. */
const VIDEOS_LISTED = 200

/** `studio_video_repo`'s `MAX_TITLE_CHARS`. */
const TITLE_MAX = 200

const InstantSchema = z.iso.datetime()

/**
 * One queued video. `stage` is `queued` today; the phone shows any stage a
 * later slice adds as one it can't name yet, so any is accepted here.
 */
const QueuedSchema = z.object({
  video: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  rev: z.int().positive(),
  title: z.string().min(1).max(TITLE_MAX),
  queuedAt: InstantSchema,
  storedAt: InstantSchema,
  stage: z.string().min(1),
})

const VideosSchema = z.object({
  videos: z.array(QueuedSchema).max(VIDEOS_LISTED),
})

/** A video id in the phone's own form that no phone makes. */
const ABSENT_VIDEO = "contract-harness-absent"

/** Not `ABSENT_VIDEO`, so a DNA naming it is not the path's. */
const OTHER_VIDEO = "contract-harness-other"

/** A DNA home would check further, but naming `OTHER_VIDEO`. */
const MISPLACED_DNA = {
  schema: "some-ui.video-dna/1",
  video: OTHER_VIDEO,
  rev: 1,
  title: "A contract's video",
  queuedAt: "2026-11-05T17:02:11.123Z",
  template: { kind: "show-format", id: "contract-harness", version: 1 },
  takes: [],
  shape: {},
  data: {},
}

/** A voice note id in the phone's own form that no phone makes. */
const ABSENT_TAKE = "contract-harness-absent-take"

/** A DNA for `ABSENT_VIDEO` whose one take is `ABSENT_TAKE`. */
const UNHELD_DNA = {
  ...MISPLACED_DNA,
  video: ABSENT_VIDEO,
  takes: [{ scene: "open", note: ABSENT_TAKE }],
}

/** Home's `422`: each refused field under `details`, the video among them. */
const RefusedSchema = z.object({
  error: z.object({
    code: z.literal("unprocessable_entity"),
    message: z.string(),
    details: z.object({ video: z.array(z.string()).min(1) }),
  }),
})

/**
 * Home's `409` for takes it doesn't hold (`FileHostError::ConflictNaming`):
 * each note by id, which the phone reads as takes still to come.
 */
const TakesNotHeldSchema = z.object({
  error: z.object({
    code: z.literal("conflict"),
    message: z.string().min(1),
    details: z.object({ notes: z.tuple([z.literal(ABSENT_TAKE)]) }),
  }),
})

const QUEUED_PATH = "/studio/videos/:video/queued/:rev"

const MISPLACED = {
  path: { video: ABSENT_VIDEO, rev: "1" },
  body: MISPLACED_DNA,
}

export const contracts = [
  defineContract({
    id: "studio_videos.list",
    module: "studio_videos",
    session: true,
    method: "GET",
    path: "/studio/videos",
    summary: `this subject's videos queued on home, newest queued first, at most ${String(VIDEOS_LISTED)}, each with when it reached home and how far it is`,
    expect: { status: 200, schema: VideosSchema },
  }),

  defineContract({
    id: "studio_videos.list_signed_out",
    module: "studio_videos",
    method: "GET",
    path: "/studio/videos",
    summary: "the videos are a subject's: without a session it is a 401",
    expect: { status: 401 },
  }),

  defineContract({
    id: "studio_videos.queued_misplaced",
    module: "studio_videos",
    session: true,
    method: "PUT",
    path: QUEUED_PATH,
    summary:
      "a DNA whose video is not the path's is a 422 naming the video, and nothing is kept",
    mutates: true,
    request: MISPLACED,
    expect: { status: 422, schema: RefusedSchema },
  }),

  defineContract({
    id: "studio_videos.queued_takes_not_held",
    module: "studio_videos",
    session: true,
    method: "PUT",
    path: QUEUED_PATH,
    summary:
      "a DNA naming a take home doesn't hold is a 409 conflict naming that note, and nothing is kept",
    mutates: true,
    request: { path: { video: ABSENT_VIDEO, rev: "1" }, body: UNHELD_DNA },
    expect: { status: 409, schema: TakesNotHeldSchema },
  }),

  defineContract({
    id: "studio_videos.queued_signed_out",
    module: "studio_videos",
    method: "PUT",
    path: QUEUED_PATH,
    summary:
      "a queue is a subject's: without a session it is a 401, and nothing is kept",
    mutates: true,
    request: MISPLACED,
    expect: { status: 401 },
  }),
]
