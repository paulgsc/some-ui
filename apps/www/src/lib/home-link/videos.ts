/**
 * Studio's videos kept for home to make (ST33, #2591; paulgsc/server's
 * studio videos): each revision Finish kept for home goes as its DNA, by one
 * `PUT /studio/videos/:video/queued/:rev` of what `@some-ui/soundbites`'
 * `videosForHome` makes of the phone's projects (handed in by Studio's
 * route, `lib/studio-keeping`), over the voice lane's `send`
 * (`./voice-copy`'s `sendVoice`), after the lane's notes have gone: a DNA
 * names its takes' voice notes by id, which home must hold first. Then, while
 * any is kept, one `GET /studio/videos` reads where each stands. This module
 * lets nothing on the phone go: the project keeps its mark either way.
 *
 * What home answered is remembered per pairing in `./sent` (`videos`), with
 * the body's fingerprint, so a run sends only a video home doesn't hold or
 * refused as it is now. Home's list, as last read, is kept for this run of
 * the app only (`videosKnown`): a launch reads it again. Home's answers:
 *
 * - `200` with `change` `added` or `unchanged`: held;
 * - `409` naming notes (`./ideas`' `notesNotHeld`, the refusal `PUT
 *   /ideas/:id` gives too): takes home doesn't hold yet, remembered so
 *   Finish names their scenes, and sent again on a later run;
 * - `409` with no notes: a different DNA under a revision home holds, which
 *   this phone never makes (a mark is never rewritten), so a fault: refused,
 *   kept on the phone, said to the native log;
 * - `422`: a body home can't read as a DNA, which this phone never makes
 *   either, so refused as that `409` is;
 * - `404`: a home that doesn't keep videos yet, so every one waits, said to
 *   the native log once a launch;
 * - `401`: home no longer knows this phone, and the run ends there;
 * - anything else ends the run, each video still waiting.
 */
import type { HomeCall, HomeExchanged, KeyedStorage } from "@some-ui/core-utils"
import { isRecord, jsonOf, unexpectedAnswer } from "@some-ui/core-utils"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import type { HomeVideo, VideoAnswer, VideoForHome } from "@some-ui/soundbites"
import { z } from "zod"

import { studioKeeping } from "@/lib/studio-keeping"

import { notesNotHeld } from "./ideas"
import type { Sent } from "./sent"
import { fingerprintOf, readSent, rememberSent } from "./sent"

/** `answer` for `video`, as `sent.videos` keeps it. */
function entryOf(answer: VideoAnswer, video: VideoForHome): string {
  const print = fingerprintOf(video.body)
  return answer.kind === "missing"
    ? `missing ${print} ${answer.notes.join(" ")}`
    : `${answer.kind} ${print}`
}

/** The answer `entry` keeps for `video` as it is now; null for none, or another body's. */
function answerOf(
  entry: string | undefined,
  video: VideoForHome
): VideoAnswer | null {
  const [kind, print, ...notes] = entry?.split(" ") ?? []
  if (print !== fingerprintOf(video.body)) return null
  if (kind === "held" || kind === "refused") return { kind }
  return kind === "missing" ? { kind, notes } : null
}

/** The videos home doesn't hold as they are now, and hasn't refused as they are. */
function videosToSend(
  videos: ReadonlyArray<VideoForHome>,
  sent: Sent
): ReadonlyArray<VideoForHome> {
  return videos.filter((video) => {
    const answer = answerOf(sent.videos[video.key], video)
    return answer === null || answer.kind === "missing"
  })
}

const videoPath = (video: VideoForHome): string =>
  `/studio/videos/${encodeURIComponent(video.video)}/queued/${String(video.rev)}`

const VIDEOS_PATH = "/studio/videos"

/** Whether a `200`'s body says home keeps the video. */
function kept(body: string): boolean {
  const answer = jsonOf(body)
  return (
    isRecord(answer) &&
    (answer.change === "added" || answer.change === "unchanged")
  )
}

/**
 * `GET /studio/videos`, as home serves it. A stage this version can't name
 * (one slice 2 or 3 adds) is still shown, as one it can't name yet.
 */
const ListSchema = z.object({
  videos: z.array(
    z.object({
      video: z.string().min(1),
      rev: z.number().int().positive(),
      storedAt: z.string().min(1),
      stage: z.string().min(1),
    })
  ),
})

/** Home's list, by `<video>/<rev>`, or null when it can't be read. */
function listOf(body: string): Readonly<Record<string, HomeVideo>> | null {
  const read = ListSchema.safeParse(jsonOf(body))
  if (!read.success) return null
  return Object.fromEntries(
    read.data.videos.map((each) => [
      `${each.video}/${String(each.rev)}`,
      {
        storedAt: each.storedAt,
        stage: each.stage === "queued" ? "queued" : "other",
      },
    ])
  )
}

/** Whether this launch has told the native log home keeps no videos. */
let unkeptSaid = false

function untaken(video: VideoForHome, status: number): void {
  if (status === 404) {
    if (unkeptSaid) return
    unkeptSaid = true
  }
  reportFailure({
    port: "Studio videos (send to home)",
    error: {
      ...toIntentError(
        new Error(`${video.key}: home answered ${String(status)}`)
      ),
      summary:
        status === 404
          ? "Home doesn't make Studio's videos yet, so they wait on this phone until it runs a newer version."
          : "Home didn't take a Studio video, so it stays on this phone. This phone never sends one twice differently, so this is a fault to look into.",
    },
  })
}

/** What a run needs: the videos to send, and where to remember home's word. */
export type VideosPort = {
  readonly going: () => Promise<ReadonlyArray<VideoForHome>>
  readonly answered: (video: VideoForHome, answer: VideoAnswer) => void
  /** Home's list, as just read. */
  readonly listed: (videos: Readonly<Record<string, HomeVideo>>) => void
}

/**
 * Sends each video `port` names, oldest first, then reads home's list while
 * any is kept, and says how the run ended.
 */
export async function sendVideos(
  port: VideosPort,
  send: HomeCall
): Promise<HomeExchanged> {
  const going = await port.going()
  for (const video of going) {
    const answer = await send("PUT", videoPath(video), video.body)
    if (answer.status === 200 && kept(answer.body)) {
      port.answered(video, { kind: "held" })
      continue
    }
    if (answer.status === 401) return { kind: "forgotten" }
    const notes = answer.status === 409 ? notesNotHeld(answer.body) : null
    if (notes !== null) {
      port.answered(video, { kind: "missing", notes })
      continue
    }
    if (answer.status === 409 || answer.status === 422) {
      port.answered(video, { kind: "refused" })
      untaken(video, answer.status)
      continue
    }
    if (answer.status === 404) {
      untaken(video, answer.status)
      return { kind: "synced" }
    }
    return unexpectedAnswer("a Studio video", answer.status)
  }
  if (known.videos.length === 0) return { kind: "synced" }
  const list = await send("GET", VIDEOS_PATH)
  if (list.status === 401) return { kind: "forgotten" }
  // A home that keeps no videos yet has no list: nothing to say of one.
  if (list.status === 404) return { kind: "synced" }
  const listed = list.status === 200 ? listOf(list.body) : null
  if (listed === null)
    return unexpectedAnswer("Studio's videos on home", list.status)
  port.listed(listed)
  return { kind: "synced" }
}

/**
 * What this run of the app knows of the videos kept for home: each as last
 * read from the projects or handed over by Finish, and home's list as last
 * read, under the pairing it was read under. Moves on each change, for the
 * voice lane and Finish.
 */
const known: {
  videos: ReadonlyArray<VideoForHome>
  listed: {
    readonly pairing: string
    readonly videos: Readonly<Record<string, HomeVideo>>
  } | null
} = { videos: [], listed: null }

let moves = 0
const listeners = new Set<() => void>()

function moved(): void {
  moves += 1
  for (const listener of listeners) listener()
}

/** What moves when a video is kept for home, or home answers or lists one. */
export const videosMoved = {
  getSnapshot: (): number => moves,
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return (): void => {
      listeners.delete(listener)
    }
  },
}

/** Home's list as this run of the app last read it under `pairing`; empty for another. */
export function videosListed(
  pairing: string | null
): Readonly<Record<string, HomeVideo>> {
  return known.listed !== null && known.listed.pairing === pairing
    ? known.listed.videos
    : {}
}

/** Finish kept `video` for home: the lane carries it on its next run. */
export function videoHanded(video: VideoForHome): void {
  if (known.videos.some((each) => each.key === video.key)) return
  known.videos = [...known.videos, video]
  moved()
}

/** The projects' videos kept for home, as just read: what the lane knows of them. */
function videosRead(videos: ReadonlyArray<VideoForHome>): void {
  const same =
    videos.length === known.videos.length &&
    videos.every(
      (video, i) =>
        video.key === known.videos[i]?.key &&
        video.body === known.videos[i]?.body
    )
  if (same) return
  known.videos = videos
  moved()
}

/**
 * The videos kept on this phone's projects as a run under `pairing` sends
 * them, remembering home's answers in `storage`; none until Studio's route
 * has handed its store in. Each answer is remembered onto the record as it
 * stands then, as `./ideas` does.
 */
export function phoneVideos(
  storage: KeyedStorage | null,
  pairing: string
): VideosPort {
  return {
    going: async (): Promise<ReadonlyArray<VideoForHome>> => {
      const studio = studioKeeping()
      if (studio === null) return []
      videosRead(studio.videosForHome(await studio.store.list()))
      return videosToSend(known.videos, readSent(storage, pairing))
    },
    answered: (video, answer): void => {
      rememberSent(storage, readSent(storage, pairing), {
        videos: { [video.key]: entryOf(answer, video) },
      })
      moved()
    },
    listed: (videos): void => {
      known.listed = { pairing, videos }
      moved()
    },
  }
}

/**
 * Home's answer for each video this run knows, as `sent` remembers it under
 * `pairing`, by key; none while unpaired.
 */
export function videoAnswers(
  storage: KeyedStorage | null,
  pairing: string | null
): Readonly<Record<string, VideoAnswer>> {
  if (pairing === null) return {}
  const sent = readSent(storage, pairing)
  return Object.fromEntries(
    known.videos.flatMap((video) => {
      const answer = answerOf(sent.videos[video.key], video)
      return answer === null ? [] : [[video.key, answer]]
    })
  )
}

/** How many videos this run knows wait to go home under `pairing`. */
export function videosWaiting(
  storage: KeyedStorage | null,
  pairing: string | null
): number {
  if (pairing === null) return known.videos.length
  return videosToSend(known.videos, readSent(storage, pairing)).length
}
