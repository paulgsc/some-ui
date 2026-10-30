import type { Primer } from "@soundbites/lib/journal/primer"
import { readPrimer } from "@soundbites/lib/journal/primer"
import type { Project } from "@soundbites/lib/project/model"
import { isAppendOnly } from "@soundbites/lib/project/model"
import type { Friction, ProjectStore } from "@soundbites/lib/project/store"
import {
  ProjectFullError,
  ProjectRewriteError,
} from "@soundbites/lib/project/store"

export const AT = "2026-10-30T09:00:00.000Z"

/** A version 2 primer: three cuts, the second read word for word. */
export const PRIMER_TEXT = JSON.stringify({
  version: 2,
  title: "Playoff Delta, week 8",
  budgetSec: 120,
  voice: "mixed",
  cuts: [
    {
      id: "path",
      artifact: "The path card",
      point: "Following the model paid off this week",
      keep: ["3 of 4 picks hit", "The model said Detroit"],
      targetSec: 20,
    },
    {
      id: "miss",
      artifact: "The miss",
      point: "The one miss",
      line: "One pick missed, and here is why.",
      targetSec: 15,
    },
    {
      id: "next",
      artifact: "End card",
      point: "What week 9 tests",
      targetSec: 10,
    },
  ],
})

export function primer(): Primer {
  const reading = readPrimer(PRIMER_TEXT)
  if (!reading.ok) throw new Error(reading.problem)
  return reading.primer
}

/**
 * The IndexedDB store's contract, in memory: the same refusals (a save that
 * rewrites, a take added without its audio, audio past `capBytes`) and the
 * same letting go of audio a save marks off the phone.
 */
export function memoryProjectStore(
  initial: ReadonlyArray<Project> = [],
  capBytes = Number.POSITIVE_INFINITY
): {
  store: ProjectStore
  projects: Map<string, Project>
  audio: Map<string, Blob>
  friction: Array<Friction>
  journal: { carried: Project | null }
} {
  const projects = new Map(initial.map((each) => [each.id, each]))
  const audio = new Map<string, Blob>()
  for (const project of initial)
    for (const take of project.takes)
      if (take.onPhone) audio.set(`${project.id}:${take.id}`, new Blob(["x"]))
  const friction: Array<Friction> = []
  const journal: { carried: Project | null } = { carried: null }

  const put = (project: Project, with_: string | null): void => {
    const kept = projects.get(project.id) ?? null
    if (kept !== null && !isAppendOnly(kept, project))
      throw new ProjectRewriteError()
    const before = kept?.takes ?? []
    const added = project.takes.filter(
      (take) => !before.some((each) => each.id === take.id)
    )
    if (added.some((take) => take.id !== with_)) throw new ProjectRewriteError()
    projects.set(project.id, project)
    for (const take of before) {
      const now = project.takes.find((each) => each.id === take.id)
      if (take.onPhone && now?.onPhone === false)
        audio.delete(`${project.id}:${take.id}`)
    }
  }

  const store: ProjectStore = {
    read: (id) => Promise.resolve(projects.get(id) ?? null),
    list: () => Promise.resolve([...projects.values()]),
    audio: (project, take) =>
      Promise.resolve(audio.get(`${project}:${take}`) ?? null),
    save: (project) => {
      try {
        put(project, null)
        return Promise.resolve()
      } catch (error) {
        return Promise.reject(
          error instanceof Error ? error : new Error(String(error))
        )
      }
    },
    keepTake: (project, take, blob) => {
      const key = `${project.id}:${take}`
      const used = [...audio.values()].reduce((sum, each) => sum + each.size, 0)
      if (audio.has(key)) return Promise.reject(new ProjectRewriteError())
      if (used + blob.size > capBytes)
        return Promise.reject(new ProjectFullError())
      try {
        put(project, take)
      } catch (error) {
        return Promise.reject(
          error instanceof Error ? error : new Error(String(error))
        )
      }
      audio.set(key, blob)
      return Promise.resolve()
    },
    carryJournal: () => {
      const { carried } = journal
      journal.carried = null
      if (carried !== null) projects.set(carried.id, carried)
      return Promise.resolve(carried)
    },
    report: (row) => {
      if (
        friction.some(
          (each) => each.project === row.project && each.sitting === row.sitting
        )
      )
        return Promise.reject(new Error("already answered"))
      friction.push(row)
      return Promise.resolve()
    },
  }
  return { store, projects, audio, friction, journal }
}
