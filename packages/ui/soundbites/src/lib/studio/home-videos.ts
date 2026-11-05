/**
 * Where a video Finish handed to home stands (STUDIO ST33): what the app's
 * home link knows (`VideosHome`, www's `lib/home-link/studio-videos`), and
 * Finish's lines from it. Pure but for the port's type: the runtime hands
 * each snapshot to the machine (`videosHeard`), and Finish reads it from the
 * machine's state.
 *
 * A video is home's once home has said it keeps it, and its stage is what
 * home's list says (`queued` until ST33's slice 2 adds the rest, which this
 * version shows as a stage it can't name yet). Until home has it, it waits
 * on this phone, and the line says why: not paired, or away from home, and
 * nothing about pairing while the phone hasn't read whether it is (ST34).
 */
import type { HomeReach } from "@soundbites/lib/idea/bundle"
import type { VideoForHome } from "@soundbites/lib/project/dna"
import { goneTakes, videoKey } from "@soundbites/lib/project/dna"
import { finishOf, queuedOf } from "@soundbites/lib/project/finish"
import { primerAt } from "@soundbites/lib/project/lookup"
import type { Project, Queued } from "@soundbites/lib/project/model"
import { latest } from "@soundbites/lib/project/model"

import { STUDIO_WORDS } from "./words"

/** What home answered for one video handed to it, as the lane remembers it. */
export type VideoAnswer =
  /** Home keeps it. */
  | { readonly kind: "held" }
  /**
   * Home doesn't hold these takes (by voice note id): not yet, and it goes
   * again, or not again, if a take was set aside or deleted for good.
   */
  | { readonly kind: "missing"; readonly notes: ReadonlyArray<string> }
  /** Home didn't take it, and won't as it is. */
  | { readonly kind: "refused" }

/** A video as home lists it: since when it keeps it, and how far it is. */
export type HomeVideo = {
  readonly storedAt: string
  /** `queued` for now; any stage this version can't name is `other`. */
  readonly stage: "queued" | "other"
}

/** What the home link knows of the videos handed to it, by `videoKey`. */
export type HomeVideos = {
  readonly reach: HomeReach
  readonly answers: Readonly<Record<string, VideoAnswer>>
  /** Home's list as last read: empty until it is. */
  readonly listed: Readonly<Record<string, HomeVideo>>
}

/** Home, as Finish hands it a video and reads where each stands. */
export type VideosHome = {
  /** A video Finish just kept for home to make: the lane carries it. */
  readonly handed: (video: VideoForHome) => void
  readonly getSnapshot: () => HomeVideos
  readonly subscribe: (listener: () => void) => () => void
}

/** What Studio knows before the home link says anything: no home. */
export const NO_HOME_VIDEOS: HomeVideos = {
  reach: "unpaired",
  answers: {},
  listed: {},
}

/** Finish's part about home making the video, for the latest revision. */
export type FinishHome =
  /** Ready, and not handed to home yet: the offer. */
  | { readonly kind: "offer" }
  /** Handed to home: where it stands, in a line. */
  | { readonly kind: "standing"; readonly line: string }

/** The names of the scenes whose takes are `notes`, as the person knows them. */
function scenesOf(
  project: Project,
  queued: Queued,
  notes: ReadonlyArray<string>
): ReadonlyArray<string> {
  const cuts = primerAt(project, queued.rev)?.cuts ?? []
  const shots = latest(project).cutList.shots.map((shot) => shot.id)
  return queued.takes
    .filter((take) => notes.includes(take.note))
    .map(
      (take) =>
        cuts.find((cut) => cut.id === take.scene)?.artifact ??
        STUDIO_WORDS.finish.toHome.scene(shots.indexOf(take.scene) + 1)
    )
}

/** Where `queued` stands, in a line, from what the home link knows. */
function standingLine(
  project: Project,
  queued: Queued,
  videos: HomeVideos
): string {
  const words = STUDIO_WORDS.finish.toHome
  const key = videoKey(project.id, queued.rev)
  const listed = videos.listed[key]
  if (listed !== undefined) {
    const since = words.when(listed.storedAt)
    return listed.stage === "queued"
      ? words.onHome(since)
      : words.onHomeOther(since)
  }
  const answer = videos.answers[key]
  if (answer?.kind === "held") return words.held
  if (answer?.kind === "refused") return words.refused
  if (answer?.kind === "missing") {
    const scenes = scenesOf(project, queued, answer.notes)
    // Deleted for good, home will never hold it again: the lane stops
    // sending it too (www's `lib/home-link/videos`).
    const gone = goneTakes(project, queued)
    return answer.notes.length > 0 &&
      answer.notes.every((note) => gone.includes(note))
      ? words.deleted(scenes)
      : words.missing(scenes)
  }
  const since = words.when(queued.at)
  return videos.reach === "near"
    ? words.going(since)
    : words.notNear[videos.reach](since)
}

/**
 * Finish's part about home making the latest revision: the offer, once an
 * episode is ready; where it stands, once handed; nothing for a video of
 * your own (ST29's templates) or one not ready.
 */
export function finishHome(
  project: Project,
  videos: HomeVideos
): FinishHome | null {
  if (project.episode === undefined) return null
  const finish = finishOf(project)
  if (finish.kind !== "ready" && finish.kind !== "released") return null
  const queued = queuedOf(project, finish.rev)
  if (queued !== null)
    return { kind: "standing", line: standingLine(project, queued, videos) }
  return finish.kind === "ready" ? { kind: "offer" } : null
}
