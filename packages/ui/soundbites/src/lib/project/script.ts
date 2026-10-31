/**
 * A project's script: how a primer becomes the cut list's scenes, how a
 * scene's length follows its chosen take, and where a sitting picks up.
 * Pure arithmetic over the project (`model.ts`), shared by the Studio
 * screens (`lib/studio`) and the carry from the Journal tab
 * (`lib/journal/carry.ts`).
 *
 * - **A scene runs its take and a breath.** Keeping a take writes the
 *   scene's length into the cut list as a number (`fitted`): the take's
 *   start (`voiceInMs`), the take, and `TAIL_MS` after it, never shorter
 *   than any moment the scene already pins (a motion, a tap, a cue).
 * - **The phone doesn't know the footage.** A scene the primer brings is a
 *   card (the series' ground) until a revision of Claude's sets its picture;
 *   a newer primer keeps every scene's picture whose cut kept its id.
 */
import { extensionOf } from "@some-ui/core-utils"
import type { Shot } from "@some-ui/video-render"
import { CUT_LIST_SCHEMA, fitToTake } from "@some-ui/video-render"
import type { Cut, Primer } from "@soundbites/lib/journal/primer"

import type { CutListShape, Project, ProjectState, ProjectTake } from "./model"
import { latest, newProject, primerAt } from "./model"

/** The breath after a take before the next scene: `render.py`'s default tail. */
export const TAIL_MS = 500

/** The series every Build Journal short pins until ST11 offers others. */
const SERIES = { id: "build-journal-short", version: 1 } as const

/** A scene is never shorter than this (the cut list's own floor). */
const SHOT_MIN_MS = 100

/** The file a take's audio is shared as, and its cut list names. */
export function takeFile(
  take: Pick<ProjectTake, "id" | "shot" | "mimeType">
): string {
  return `${take.shot}-${take.id}.${extensionOf(take.mimeType)}`
}

/** The latest moment a scene pins, which its length may not cut off. */
function pinnedMs(shot: Shot): number {
  const { motion, cues } = shot.overrides
  const times = [
    ...(shot.picture.kind === "capture" ? shot.picture.taps : []),
    ...(motion?.kind === "punch-in" ? motion.at : []),
    ...(motion?.kind === "freeze" ? [motion.atMs] : []),
    ...(motion?.kind === "pan" ? motion.keys.map(([at]) => at) : []),
    ...(cues ?? []).map((cue) => cue.atMs),
  ]
  return Math.max(SHOT_MIN_MS, ...times.map((at) => at + 1))
}

/** How long a scene runs for a take of `takeMs`. */
export function lengthFor(shot: Shot, takeMs: number): number {
  return fitToTake({
    takeMs: Math.round(takeMs),
    voiceInMs: shot.voiceInMs,
    tailMs: TAIL_MS,
    minMs: pinnedMs(shot),
  })
}

/** `cutList` with scene `shotId` fitted to `take`. */
export function fitted(
  cutList: CutListShape,
  shotId: string,
  take: Pick<ProjectTake, "id" | "shot" | "mimeType" | "durationMs">
): CutListShape {
  return {
    ...cutList,
    shots: cutList.shots.map((shot) =>
      shot.id === shotId
        ? {
            ...shot,
            durationMs: lengthFor(shot, take.durationMs),
            take: {
              file: takeFile(take),
              inMs: 0,
              outMs: Math.round(take.durationMs),
            },
          }
        : shot
    ),
  }
}

function shotFor(cut: Cut, primer: Primer, was: Shot | undefined): Shot {
  const voice = primer.voice === "mixed" ? { voice: cut.voice } : {}
  if (was !== undefined) {
    const { voice: _, ...kept } = was
    return { ...kept, ...voice, cut: cut.id }
  }
  return {
    id: cut.id,
    cut: cut.id,
    picture: { kind: "card" },
    durationMs: cut.targetMs,
    voiceInMs: 200,
    overrides: {},
    burnIns: [],
    idea: { origin: "agent" },
    ...voice,
  }
}

/**
 * The cut list a primer reads as: one scene per cut, in its order, each as
 * long as its target. With `before` (the revision it follows), a scene whose
 * cut kept its id keeps its picture and its fit; one with a chosen take is
 * fitted to it again.
 */
export function cutListOf(
  primer: Primer,
  before: { cutList: CutListShape; project: Project } | null = null
): CutListShape {
  const base: CutListShape = {
    schema: CUT_LIST_SCHEMA,
    title: primer.title,
    series: before?.cutList.series ?? SERIES,
    look: before?.cutList.look ?? "calm",
    voice: primer.voice,
    ...(before?.cutList.music === undefined
      ? {}
      : { music: before.cutList.music }),
    shots: primer.cuts.map((cut) =>
      shotFor(
        cut,
        primer,
        before?.cutList.shots.find((shot) => shot.id === cut.id)
      )
    ),
    burnIns: before?.cutList.burnIns ?? [],
  }
  if (before === null) return base
  return base.shots.reduce((cutList, shot) => {
    const take = chosenTake(before.project, shot.id)
    return take === null ? cutList : fitted(cutList, shot.id, take)
  }, base)
}

/** The project a primer opens as: revision 1, Claude's, nothing taken. */
export function projectFromPrimer(
  id: string,
  primer: Primer,
  at: string
): ProjectState {
  return newProject(id, {
    author: "claude",
    message: `Primer: ${primer.title}`,
    at,
    cutList: cutListOf(primer),
    primer,
  })
}

/** The take chosen for scene `shot`, if one is. */
export function chosenTake(project: Project, shot: string): ProjectTake | null {
  const id = project.chosen[shot]
  return project.takes.find((each) => each.id === id) ?? null
}

/** The primer in force now, and the cut each scene of the latest revision says. */
export function scriptOf(project: Project): {
  readonly primer: Primer | null
  readonly scenes: ReadonlyArray<{
    readonly shot: Shot
    readonly cut: Cut | null
  }>
} {
  const revision = latest(project)
  const primer = primerAt(project, revision.rev)
  return {
    primer,
    scenes: revision.cutList.shots.map((shot) => ({
      shot,
      cut: primer?.cuts.find((cut) => cut.id === (shot.cut ?? shot.id)) ?? null,
    })),
  }
}

/**
 * How long a take for `shot` may run: the primer's budget less every other
 * scene's chosen take. The scene's own take does not count, since a new one
 * is chosen in its place.
 */
export function capFor(project: Project, shot: string): number {
  const { primer, scenes } = scriptOf(project)
  const budgetMs = primer?.budgetMs ?? 0
  const spent = scenes
    .filter((scene) => scene.shot.id !== shot)
    .reduce(
      (sum, scene) =>
        sum + (chosenTake(project, scene.shot.id)?.durationMs ?? 0),
      0
    )
  return Math.max(0, budgetMs - spent)
}

/**
 * Where a sitting opens: where the last one closed, if that scene is still
 * there; after a sitting that never closed (the app went away), the scene of
 * the last take kept; else the first scene with no take, else the first.
 */
export function resumeAt(project: Project): string {
  const { shots } = latest(project).cutList
  const has = (id: string | null | undefined): id is string =>
    shots.some((shot) => shot.id === id)
  const last = project.sittings.at(-1)
  if (last?.closedAt != null && has(last.shot)) return last.shot
  const lastTake = [...project.takes].reverse().find((take) => has(take.shot))
  if (lastTake !== undefined) return lastTake.shot
  const open = shots.find((shot) => project.chosen[shot.id] === undefined)
  return (open ?? shots[0])?.id ?? ""
}

/** When anything last happened to a project: its newest revision, take or sitting. */
function touchedAt(project: Project): string {
  return [
    ...project.revisions.map((each) => each.at),
    ...project.takes.map((each) => each.recordedAt),
    ...project.sittings.flatMap((each) => [
      each.openedAt,
      each.closedAt ?? each.openedAt,
    ]),
  ].reduce((a, b) => (b > a ? b : a), "")
}

/** The project worked on last, which the Studio opens on. */
export function currentOf(projects: ReadonlyArray<Project>): Project | null {
  return projects.reduce<Project | null>(
    (best, each) =>
      best === null || touchedAt(each) > touchedAt(best) ? each : best,
    null
  )
}

/** A project id for a primer opened at `at`: its title, then when. */
export function projectIdFor(title: string, at: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
  const when = at.replace(/[^0-9TZ]/g, "")
  return slug === "" ? `video-${when}` : `${slug}-${when}`
}
