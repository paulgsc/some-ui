import { homeHoldsNow } from "@soundbites/lib/home-held"
import { byNewest, displacedBy } from "@soundbites/lib/policy"
import type { SoundbiteStore } from "@soundbites/lib/store"
import { SoundbitesFullError } from "@soundbites/lib/store"
import type { Soundbite } from "@soundbites/lib/types"

/** A soundbite recorded `minutesAgo` before 2026-10-01 12:00 UTC. */
export function bite(id: string, minutesAgo: number): Soundbite {
  return {
    id,
    recordedAt: new Date(
      Date.UTC(2026, 9, 1, 12) - minutesAgo * 60_000
    ).toISOString(),
    durationMs: 12_000,
    mimeType: "audio/webm",
    bytes: 4_000,
    context: {
      source: "direct",
      lastSessionAt: null,
      openSessions: 0,
      timeZone: "UTC",
    },
  }
}

/**
 * The IndexedDB store's contract, in memory: the same `displacedBy` on save,
 * so a test of the page exercises the cap exactly as the phone applies it,
 * and a Redo and a Let go mark a soundbite as the phone's store does.
 */
export function memoryStore(initial: ReadonlyArray<Soundbite> = []): {
  store: SoundbiteStore
  kept: Map<string, { bite: Soundbite; audio: Blob }>
} {
  const kept = new Map(
    initial.map((b) => [b.id, { bite: b, audio: new Blob(["x"]) }])
  )
  const listeners = new Set<() => void>()
  const changed = (): void => {
    for (const listener of listeners) listener()
  }
  return {
    kept,
    store: {
      list: (): Promise<Array<Soundbite>> =>
        Promise.resolve(byNewest([...kept.values()].map((k) => k.bite))),
      audio: (id): Promise<Blob | null> =>
        Promise.resolve(kept.get(id)?.audio ?? null),
      save: (b, audio, replace, supersedes = null): Promise<void> => {
        const all = [...kept.values()].map((k) => k.bite)
        const leaving = displacedBy(all, replace, homeHoldsNow())
        if (leaving === null) return Promise.reject(new SoundbitesFullError())
        for (const id of leaving) kept.delete(id)
        const redone = supersedes === null ? undefined : kept.get(supersedes)
        if (redone !== undefined && supersedes !== null)
          kept.set(supersedes, {
            ...redone,
            bite: { ...redone.bite, standing: "earlier" },
          })
        kept.set(b.id, { bite: b, audio })
        changed()
        return Promise.resolve()
      },
      setAside: (id, at): Promise<void> => {
        const each = kept.get(id)
        if (each !== undefined && each.bite.standing !== "set-aside")
          kept.set(id, {
            ...each,
            bite: { ...each.bite, standing: "set-aside", setAsideAt: at },
          })
        changed()
        return Promise.resolve()
      },
      subscribe: (listener): (() => void) => {
        listeners.add(listener)
        return (): void => {
          listeners.delete(listener)
        }
      },
    },
  }
}
