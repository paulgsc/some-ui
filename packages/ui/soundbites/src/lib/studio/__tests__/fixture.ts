import type { Primer } from "@soundbites/lib/journal/primer"
import { readPrimer } from "@soundbites/lib/journal/primer"
import type { Project } from "@soundbites/lib/project/model"
import { admitted } from "@soundbites/lib/project/model"
import type {
  Carried,
  Change,
  Friction,
  Leftovers,
  ProjectStore,
  Written,
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
 * The IndexedDB store's contract, in memory: each `update` applies its change
 * to what is held at the moment it runs, decided by the store's own
 * `admitted`, audio past `capBytes` refused, and a change notice after each
 * write. `gate`, when a test sets it, holds every write until it resolves.
 */
export function memoryProjectStore(
  initial: ReadonlyArray<Project> = [],
  capBytes = Number.POSITIVE_INFINITY
): {
  store: ProjectStore
  projects: Map<string, Project>
  audio: Map<string, Blob>
  friction: Array<Friction>
  notices: Map<number, string>
  journal: { carried: Carried; leftovers: Leftovers }
  gate: { hold: (() => Promise<void>) | null }
} {
  const projects = new Map(initial.map((each) => [each.id, each]))
  const audio = new Map<string, Blob>()
  for (const project of initial)
    for (const take of project.takes)
      if (take.onPhone) audio.set(`${project.id}:${take.id}`, new Blob(["x"]))
  const friction: Array<Friction> = []
  const notices = new Map<number, string>()
  let noticeKey = 0
  const journal: { carried: Carried; leftovers: Leftovers } = {
    carried: { kind: "nothing" },
    leftovers: { rows: 0, bytes: 0 },
  }
  const gate: { hold: (() => Promise<void>) | null } = { hold: null }
  const listeners = new Set<() => void>()
  const changed = (): void => {
    for (const listener of listeners) listener()
  }
  const used = (): number =>
    [...audio.values()].reduce((sum, each) => sum + each.size, 0)

  /** One write, as the store's transaction runs it: all of it, or nothing. */
  const write = (
    id: string,
    change: Change,
    added?: { readonly take: string; readonly blob: Blob }
  ): Written => {
    const held = projects.get(id) ?? null
    const next = change(held)
    if (next === null) return { before: held, project: held, changed: false }
    const admission = admitted(held, next, added?.take ?? null)
    if (!admission.ok || next.id !== id) throw new ProjectRewriteError()
    if (added !== undefined) {
      const key = `${id}:${added.take}`
      if (audio.has(key) || !next.takes.some((t) => t.id === added.take))
        throw new ProjectRewriteError()
      if (used() + added.blob.size > capBytes) throw new ProjectFullError()
      audio.set(key, added.blob)
    }
    projects.set(id, next)
    for (const take of admission.letGo) audio.delete(`${id}:${take}`)
    return { before: held, project: next, changed: true }
  }

  const store: ProjectStore = {
    read: (id) => Promise.resolve(projects.get(id) ?? null),
    list: () => Promise.resolve([...projects.values()]),
    audio: (project, take) =>
      Promise.resolve(audio.get(`${project}:${take}`) ?? null),
    room: () =>
      Promise.resolve(
        capBytes === Number.POSITIVE_INFINITY
          ? Number.MAX_SAFE_INTEGER
          : Math.max(0, capBytes - used())
      ),
    update: async (id, change, added) => {
      if (gate.hold !== null) await gate.hold()
      const written = write(id, change, added)
      if (written.changed) changed()
      return written
    },
    leftovers: () => Promise.resolve(journal.leftovers),
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
      changed()
      return Promise.resolve()
    },
    remember: (notice) => {
      notices.set(++noticeKey, notice)
      return Promise.resolve()
    },
    notices: () =>
      Promise.resolve(
        [...notices.entries()].map(([key, text]) => ({ key, text }))
      ),
    forget: (keys) => {
      for (const key of keys) notices.delete(key)
      return Promise.resolve()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
  }
  return { store, projects, audio, friction, notices, journal, gate }
}
