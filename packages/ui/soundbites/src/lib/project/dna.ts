/**
 * A queued video's DNA (STUDIO ST33), as `@some-ui/video-render`'s `dna.ts`
 * defines it, made from the project alone: the revision queued as its shape
 * (with its notes, which an owner's idea may cite), the take each scene says,
 * and, for an episode, its pins and each scene's point and facts from the
 * primer in force. Only an episode has a template yet; a video of your own
 * waits on ST29's.
 *
 * Made once, when Finish keeps the mark (`queueMark`): the mark holds the
 * DNA's canonical body (`Queued`'s `dna`), the project's append-only record
 * keeps it as written (`./model`'s `isAppendOnly`), and every send is that
 * body (`videosForHome`). Nothing made later, by a newer version of the app
 * or a phone paired again, can put other bytes under a revision home holds.
 */
import { canonicalJson } from "@some-ui/core-utils"
import type { Parsed, VideoDna } from "@some-ui/video-render"
import {
  parseVideoDna,
  VIDEO_DNA_MAX_BYTES,
  VIDEO_DNA_SCHEMA,
} from "@some-ui/video-render"

import { primerAt } from "./lookup"
import type { Project, Queued } from "./model"
import { cutListAt, latest } from "./model"

/** `project`'s DNA for revision `rev`, queued at `at` with `takes`, or every reason home would not keep it as written. */
function dnaOf(
  project: Project,
  rev: number,
  at: string,
  takes: Queued["takes"]
): Parsed<VideoDna> {
  const { episode } = project
  if (episode === undefined)
    return { ok: false, problems: ["a video of your own has no template yet"] }
  const shape = cutListAt(project, rev)
  if (shape === null) return { ok: false, problems: [`no rev ${rev}`] }
  const cuts = primerAt(project, rev)?.cuts ?? []
  const scenes = shape.shots.flatMap((shot) => {
    const cut = cuts.find((each) => each.id === (shot.cut ?? shot.id))
    return cut === undefined
      ? []
      : [{ scene: shot.id, point: cut.point, keep: [...cut.keep] }]
  })
  return parseVideoDna({
    schema: VIDEO_DNA_SCHEMA,
    video: project.id,
    rev,
    title: shape.title,
    queuedAt: at,
    template: {
      kind: "show-format",
      id: episode.format.id,
      version: episode.format.version,
    },
    takes,
    shape,
    data: { episode, scenes },
  })
}

/** Why the latest revision can't be queued: no DNA can be made of it, or it is past home's limit. */
type QueueRefusal = "unmade" | "tooLarge"

/**
 * The mark Finish keeps to have home make the latest revision as it stands,
 * at `at`: the take each scene says now, and the DNA made of them, once, as
 * home is sent it (its canonical JSON, the same DNA the same bytes whatever
 * order its keys were made in); or why none is kept. Both refusals are
 * decided here, before anything is written.
 */
export function queueMark(
  project: Project,
  at: string
): { readonly mark: Queued } | { readonly refused: QueueRefusal } {
  const { rev, cutList } = latest(project)
  const takes = cutList.shots.flatMap((shot) => {
    const note = project.chosen[shot.id]
    return note === undefined ? [] : [{ scene: shot.id, note }]
  })
  const dna = dnaOf(project, rev, at, takes)
  if (!dna.ok) return { refused: "unmade" }
  const body = canonicalJson(dna.value)
  if (new TextEncoder().encode(body).length > VIDEO_DNA_MAX_BYTES)
    return { refused: "tooLarge" }
  return { mark: { rev, at, takes, dna: body } }
}

/** The key a video's revision is answered and listed under. */
export const videoKey = (video: string, rev: number): string =>
  `${video}/${String(rev)}`

/** A video kept for home to make, as the home link sends it. */
export type VideoForHome = {
  /** `<video>/<rev>`: what home's answer and list are kept under. */
  readonly key: string
  readonly video: string
  readonly rev: number
  /** When the owner finished it, ISO 8601. */
  readonly queuedAt: string
  /** The DNA as the mark keeps it: every send is these bytes. */
  readonly body: string
  /** The voice notes its takes name that home deleted for good (`goneTakes`). */
  readonly gone: ReadonlyArray<string>
}

/**
 * The voice notes `mark`'s takes name that this phone heard home deleted
 * for good (MY-DATA MD3, the take's `deletedAt`): home will never hold them
 * again, so a video naming one can't be made as it is.
 */
export function goneTakes(
  project: Project,
  mark: Queued
): ReadonlyArray<string> {
  const deleted = new Set(
    project.takes
      .filter((take) => take.deletedAt !== undefined)
      .map((take) => take.id)
  )
  return mark.takes.map((take) => take.note).filter((note) => deleted.has(note))
}

/** `mark`, kept on `project`, as the home link sends it. */
export const videoForHome = (project: Project, mark: Queued): VideoForHome => ({
  key: videoKey(project.id, mark.rev),
  video: project.id,
  rev: mark.rev,
  queuedAt: mark.at,
  body: mark.dna,
  gone: goneTakes(project, mark),
})

/**
 * Every revision queued for home to make, over `projects`, as the home
 * link's lane sends it, oldest first.
 */
export function videosForHome(
  projects: ReadonlyArray<Project>
): ReadonlyArray<VideoForHome> {
  return projects
    .flatMap((project) =>
      (project.queued ?? []).map((mark) => videoForHome(project, mark))
    )
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))
}
