/**
 * A queued video's DNA (STUDIO ST33), as `@some-ui/video-render`'s `dna.ts`
 * defines it, made from the project alone: the revision queued as its shape,
 * the takes the queued mark names (`Queued`), and, for an episode, its pins
 * and each scene's point and facts from the primer in force. Pure, and the
 * same bytes for the same mark every time: what it reads at a queued
 * revision is never rewritten (`./model`'s `isAppendOnly`), and the notes,
 * which can change, are left out. Only an episode has a template yet;
 * a video of your own waits on ST29's.
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
import { cutListAt } from "./model"

/** `queued`'s DNA, or every reason home would not keep it as written. */
export function dnaOf(project: Project, queued: Queued): Parsed<VideoDna> {
  const { episode } = project
  if (episode === undefined)
    return { ok: false, problems: ["a video of your own has no template yet"] }
  const cutList = cutListAt(project, queued.rev)
  if (cutList === null) return { ok: false, problems: [`no rev ${queued.rev}`] }
  // Notes are remarks about a version, not the video, and one can be added
  // or settled after it is queued: the DNA leaves them out, so it stays the
  // same bytes.
  const shape = { ...cutList, notes: [] }
  const cuts = primerAt(project, queued.rev)?.cuts ?? []
  const scenes = shape.shots.flatMap((shot) => {
    const cut = cuts.find((each) => each.id === (shot.cut ?? shot.id))
    return cut === undefined
      ? []
      : [{ scene: shot.id, point: cut.point, keep: [...cut.keep] }]
  })
  return parseVideoDna({
    schema: VIDEO_DNA_SCHEMA,
    video: project.id,
    rev: queued.rev,
    title: shape.title,
    queuedAt: queued.at,
    template: {
      kind: "show-format",
      id: episode.format.id,
      version: episode.format.version,
    },
    takes: queued.takes.map(({ scene, note }) => ({ scene, note })),
    shape,
    data: { episode, scenes },
  })
}

/**
 * The DNA as home is sent it: its canonical JSON, so the same DNA is the
 * same bytes whatever order its keys were made in.
 */
export const dnaBody = (dna: VideoDna): string => canonicalJson(dna)

/** Whether `dna` is within what home keeps of one, in bytes of UTF-8. */
const dnaFits = (dna: VideoDna): boolean =>
  new TextEncoder().encode(dnaBody(dna)).length <= VIDEO_DNA_MAX_BYTES

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
  /** The DNA as home is sent it (`dnaBody`), within its limit. */
  readonly body: string
}

/** `dna` as the home link sends it. */
export const videoForHome = (dna: VideoDna): VideoForHome => ({
  key: videoKey(dna.video, dna.rev),
  video: dna.video,
  rev: dna.rev,
  queuedAt: dna.queuedAt,
  body: dnaBody(dna),
})

/**
 * Every revision queued for home to make, over `projects`, as the home
 * link's lane sends it, oldest first. A mark whose DNA can't be made, or is
 * past home's limit, is left out; Finish refuses to keep one
 * (`queueRefusal`), so none is.
 */
export function videosForHome(
  projects: ReadonlyArray<Project>
): ReadonlyArray<VideoForHome> {
  return projects
    .flatMap((project) =>
      (project.queued ?? []).flatMap((queued) => {
        const dna = dnaOf(project, queued)
        return dna.ok && dnaFits(dna.value) ? [videoForHome(dna.value)] : []
      })
    )
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))
}

/**
 * Why the latest revision can't be queued with the takes it has now, or
 * null when it can: no DNA can be made of it, or it is past home's limit.
 */
export function queueRefusal(
  project: Project,
  queued: Queued
): "unmade" | "tooLarge" | null {
  const dna = dnaOf(project, queued)
  if (!dna.ok) return "unmade"
  return dnaFits(dna.value) ? null : "tooLarge"
}
