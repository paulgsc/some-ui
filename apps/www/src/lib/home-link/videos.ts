/**
 * Studio's videos kept for home to make (ST33, #2591; paulgsc/server's
 * studio videos): each revision Finish kept for home goes as the DNA its
 * mark keeps, by one `PUT /studio/videos/:video/queued/:rev` of what
 * `@some-ui/soundbites`' `videosForHome` makes of the phone's projects
 * (handed in by Studio's route, `lib/studio-keeping`), over the voice lane's
 * `send` (`./voice-copy`'s `sendVoice`), after the lane's notes have gone: a
 * DNA names its takes' voice notes by id, which home must hold first. Then,
 * while any is kept, one `GET /studio/videos` reads where each stands. This
 * module lets nothing on the phone go: the project keeps its mark either way.
 *
 * What home answered is remembered per pairing in `./sent` (`videos`), with
 * the body's fingerprint, so a run sends only a video home doesn't hold and
 * hasn't refused. Which videos are kept is read from Studio's projects when
 * its route hands them in, on each write to them and at each run, so what
 * home answered on an earlier launch is said before the lane next runs.
 * Home's list, as last read, is kept for this run of the app only
 * (`videosListed`): a launch reads it again. Home's answers, read as
 * `./keyed-send` reads them:
 *
 * - `200` with `change` `added` or `unchanged`: held;
 * - `409` naming notes (the refusal `PUT /ideas/:id` gives too): takes home
 *   doesn't hold, remembered so Finish names their scenes, and sent again
 *   on a later run, unless every one is a take this phone heard home
 *   deleted for good (`VideoForHome`'s `gone`), which home will never hold;
 * - `409` with no notes: a different DNA under a revision home holds, which
 *   this phone never sends (each send is the body the mark keeps), so a
 *   fault: refused, kept on the phone, said to the native log;
 * - `422`: a body home can't read as a DNA, which Finish never keeps
 *   either, so refused as that `409` is;
 * - `404`: a home that doesn't keep videos yet, so every one waits, said to
 *   the native log once a launch;
 * - `401`: home no longer knows this phone, and the run ends there;
 * - anything else ends the run, each video still waiting.
 */
import type { HomeCall, HomeExchanged, KeyedStorage } from "@some-ui/core-utils"
import { isRecord, jsonOf, unexpectedAnswer } from "@some-ui/core-utils"
import type {
  HomeVideo,
  StudioKeeping,
  VideoAnswer,
  VideoForHome,
} from "@some-ui/soundbites"
import { z } from "zod"

import { movesSignal } from "@/lib/moves"
import { onStudioKept, studioKeeping } from "@/lib/studio-keeping"

import type { KeyedSend } from "./keyed-send"
import { sendKeyed, untakenTold } from "./keyed-send"
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

/**
 * The videos home doesn't hold and hasn't refused, but for one whose takes
 * home lacks are each one home deleted for good: it would only be refused
 * again.
 */
function videosToSend(
  videos: ReadonlyArray<VideoForHome>,
  sent: Sent
): ReadonlyArray<VideoForHome> {
  return videos.filter((video) => {
    const answer = answerOf(sent.videos[video.key], video)
    if (answer === null) return true
    return (
      answer.kind === "missing" &&
      !(
        answer.notes.length > 0 &&
        answer.notes.every((note) => video.gone.includes(note))
      )
    )
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

/**
 * Home's list, of the videos `videos` names, by each one's key (soundbites'
 * `videoKey`, made there alone), or null when it can't be read.
 */
function listOf(
  body: string,
  videos: ReadonlyArray<VideoForHome>
): Readonly<Record<string, HomeVideo>> | null {
  const read = ListSchema.safeParse(jsonOf(body))
  if (!read.success) return null
  return Object.fromEntries(
    videos.flatMap((video) => {
      const each = read.data.videos.find(
        (listed) => listed.video === video.video && listed.rev === video.rev
      )
      if (each === undefined) return []
      const stage = each.stage === "queued" ? "queued" : "other"
      return [[video.key, { storedAt: each.storedAt, stage }]]
    })
  )
}

/** Home not taking a video, said to the native log. */
const untaken = untakenTold("Studio videos (send to home)", {
  unkept:
    "Home doesn't make Studio's videos yet, so they wait on this phone until it runs a newer version.",
  refused:
    "Home didn't take a Studio video, so it stays on this phone. This phone sends each video as Finish kept it, so this is a fault to look into.",
})

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
  const home = { keepsNone: false }
  const how: KeyedSend<VideoForHome> = {
    what: "a Studio video",
    path: videoPath,
    body: (video) => video.body,
    kept,
    answered: port.answered,
    untaken: (video, status): void => {
      if (status === 404) home.keepsNone = true
      untaken(video.key, status)
    },
  }
  const sent = await sendKeyed(await port.going(), how, send)
  // A home that keeps no videos yet has no list either.
  if (sent.kind !== "synced" || home.keepsNone) return sent
  if (known.videos.length === 0) return { kind: "synced" }
  const list = await send("GET", VIDEOS_PATH)
  if (list.status === 401) return { kind: "forgotten" }
  if (list.status === 404) return { kind: "synced" }
  const listed = list.status === 200 ? listOf(list.body, known.videos) : null
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

const videoMoves = movesSignal()

/** What moves when a video is kept for home, or home answers or lists one. */
export const videosMoved = videoMoves.moves

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
  videoMoves.moved()
}

/** The projects' videos kept for home, as just read: what the lane knows of them. */
function videosRead(videos: ReadonlyArray<VideoForHome>): void {
  const same =
    videos.length === known.videos.length &&
    videos.every(
      (video, i) =>
        video.key === known.videos[i]?.key &&
        video.body === known.videos[i]?.body &&
        video.gone.join(" ") === known.videos[i]?.gone.join(" ")
    )
  if (same) return
  known.videos = videos
  videoMoves.moved()
}

/** Reads asked of Studio's projects; only the newest one asked is kept. */
let reads = 0

/** The videos kept on `studio`'s projects, read now; kept as known while no newer read was asked. */
async function readVideos(
  studio: StudioKeeping
): Promise<ReadonlyArray<VideoForHome>> {
  reads += 1
  const asked = reads
  const videos = studio.videosForHome(await studio.store.list())
  if (asked === reads) videosRead(videos)
  return videos
}

/** Reads Studio's videos for what is said of them, failing quietly. */
function readQuietly(): void {
  const studio = studioKeeping()
  if (studio === null) return
  readVideos(studio).catch(() => {
    // Ignored: the lane's own read (`going`) meets the same store, and a
    // store it can't list ends that run, said there.
  })
}

// Studio's projects, read once its route hands them in and on each write to
// them: a video kept on an earlier launch counts, and says what home
// answered, without waiting for the lane's next run.
let watching = false
function watchStudio(): void {
  const studio = studioKeeping()
  if (studio === null || watching) return
  watching = true
  // Never undone: what is handed in is kept for the app's life.
  studio.store.subscribe(readQuietly)
  readQuietly()
}
onStudioKept(watchStudio)
watchStudio()

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
      return videosToSend(await readVideos(studio), readSent(storage, pairing))
    },
    answered: (video, answer): void => {
      rememberSent(storage, readSent(storage, pairing), {
        videos: { [video.key]: entryOf(answer, video) },
      })
      videoMoves.moved()
    },
    listed: (videos): void => {
      known.listed = { pairing, videos }
      videoMoves.moved()
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
