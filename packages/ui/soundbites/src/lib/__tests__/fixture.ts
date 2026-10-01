import { byNewest, displacedBy } from "@soundbites/lib/policy"
import type { SoundbiteStore } from "@soundbites/lib/store"
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
 * so a test of the page exercises the cap exactly as the phone applies it.
 */
export function memoryStore(initial: ReadonlyArray<Soundbite> = []): {
  store: SoundbiteStore
  kept: Map<string, { bite: Soundbite; audio: Blob }>
} {
  const kept = new Map(
    initial.map((b) => [b.id, { bite: b, audio: new Blob(["x"]) }])
  )
  return {
    kept,
    store: {
      list: (): Promise<Array<Soundbite>> =>
        Promise.resolve(byNewest([...kept.values()].map((k) => k.bite))),
      audio: (id): Promise<Blob | null> =>
        Promise.resolve(kept.get(id)?.audio ?? null),
      save: (b, audio, replace): Promise<void> => {
        const all = [...kept.values()].map((k) => k.bite)
        for (const id of displacedBy(all, replace)) kept.delete(id)
        kept.set(b.id, { bite: b, audio })
        return Promise.resolve()
      },
      remove: (id): Promise<void> => {
        kept.delete(id)
        return Promise.resolve()
      },
    },
  }
}
