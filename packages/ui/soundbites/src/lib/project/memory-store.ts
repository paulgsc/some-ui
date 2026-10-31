/**
 * The IndexedDB project store's contract (`./store`), in memory: for the
 * Studio tests and the ui-fit phone page (`@some-ui/soundbites/fixtures`),
 * where a screen is mounted on fakes.
 */
import type { Project } from "./model"
import { admitted } from "./model"
import type { Carried, Change, Friction, ProjectStore, Written } from "./store"
import { ProjectFullError, ProjectRewriteError } from "./store"

export type MemoryProjectStore = {
  store: ProjectStore
  projects: Map<string, Project>
  audio: Map<string, Blob>
  friction: Array<Friction>
  notices: Map<number, string>
  journal: { carried: Carried }
  /** Holds every write until it resolves, while set. */
  gate: { hold: (() => Promise<void>) | null }
}

/**
 * Each `update` applies its change to what is held at the moment it runs,
 * decided by the store's own `admitted`, audio past `capBytes` refused, and a
 * change notice after each write. Every take of `initial` that is on the
 * phone has a byte of audio.
 */
export function memoryProjectStore(
  initial: ReadonlyArray<Project> = [],
  capBytes = Number.POSITIVE_INFINITY
): MemoryProjectStore {
  const projects = new Map(initial.map((each) => [each.id, each]))
  const audio = new Map<string, Blob>()
  for (const project of initial)
    for (const take of project.takes)
      if (take.onPhone) audio.set(`${project.id}:${take.id}`, new Blob(["x"]))
  const friction: Array<Friction> = []
  const notices = new Map<number, string>()
  let noticeKey = 0
  const journal: { carried: Carried } = {
    carried: { kind: "nothing", cleared: 0 },
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
    carryJournal: () => {
      const { carried } = journal
      journal.carried = { kind: "nothing", cleared: 0 }
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
    friction: () => Promise.resolve([...friction]),
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
