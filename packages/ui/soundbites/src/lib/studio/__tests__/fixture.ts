import type { Primer } from "@soundbites/lib/journal/primer"
import { readPrimer } from "@soundbites/lib/journal/primer"
import type { Project } from "@soundbites/lib/project/model"
import { admitted } from "@soundbites/lib/project/model"
import type {
  Carried,
  Friction,
  ProjectStore,
} from "@soundbites/lib/project/store"
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
 * The IndexedDB store's contract, in memory: the same refusals and the same
 * letting go of audio, decided by the store's own `admitted`, audio past
 * `capBytes` refused, and a change notice after each write.
 */
export function memoryProjectStore(
  initial: ReadonlyArray<Project> = [],
  capBytes = Number.POSITIVE_INFINITY
): {
  store: ProjectStore
  projects: Map<string, Project>
  audio: Map<string, Blob>
  friction: Array<Friction>
  journal: { carried: Carried }
} {
  const projects = new Map(initial.map((each) => [each.id, each]))
  const audio = new Map<string, Blob>()
  for (const project of initial)
    for (const take of project.takes)
      if (take.onPhone) audio.set(`${project.id}:${take.id}`, new Blob(["x"]))
  const friction: Array<Friction> = []
  const journal: { carried: Carried } = { carried: { kind: "nothing" } }
  const listeners = new Set<() => void>()
  const changed = (): Promise<void> => {
    for (const listener of listeners) listener()
    return Promise.resolve()
  }

  /** Puts `project` as the store would, or says why not. */
  const put = (project: Project, adding: string | null): Error | null => {
    const admission = admitted(
      projects.get(project.id) ?? null,
      project,
      adding
    )
    if (!admission.ok) return new ProjectRewriteError()
    projects.set(project.id, project)
    for (const take of admission.letGo) audio.delete(`${project.id}:${take}`)
    return null
  }

  const store: ProjectStore = {
    read: (id) => Promise.resolve(projects.get(id) ?? null),
    list: () => Promise.resolve([...projects.values()]),
    audio: (project, take) =>
      Promise.resolve(audio.get(`${project}:${take}`) ?? null),
    save: (project) => {
      const refused = put(project, null)
      return refused === null ? changed() : Promise.reject(refused)
    },
    keepTake: (project, take, blob) => {
      const key = `${project.id}:${take}`
      const used = [...audio.values()].reduce((sum, each) => sum + each.size, 0)
      if (audio.has(key)) return Promise.reject(new ProjectRewriteError())
      if (used + blob.size > capBytes)
        return Promise.reject(new ProjectFullError())
      const refused = put(project, take)
      if (refused !== null) return Promise.reject(refused)
      audio.set(key, blob)
      return changed()
    },
    carryJournal: () => {
      const { carried } = journal
      journal.carried = { kind: "nothing" }
      if (carried.kind === "carried")
        projects.set(carried.project.id, carried.project)
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
      return changed()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
  }
  return { store, projects, audio, friction, journal }
}
