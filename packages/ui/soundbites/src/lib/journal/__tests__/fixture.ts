import type { JournalPlan, JournalTake } from "@soundbites/lib/journal/plan"
import { inCutOrder } from "@soundbites/lib/journal/plan"
import type { Primer } from "@soundbites/lib/journal/primer"
import { cutV1 } from "@soundbites/lib/journal/primer"
import type {
  JournalShelf,
  JournalSnapshot,
  JournalStore,
} from "@soundbites/lib/journal/store"
import {
  JournalFullError,
  JournalStaleError,
} from "@soundbites/lib/journal/store"
import { JOURNAL_TAKES_MAX_BYTES } from "@soundbites/lib/policy"

/** 2026-10-12 12:00 UTC, in epoch ms. */
export const NOON = Date.UTC(2026, 9, 12, 12)

export const PRIMER: Primer = {
  title: "AMO release notes",
  budgetMs: 180_000,
  voice: "read",
  cuts: [
    cutV1({
      id: "gap",
      artifact: "Old notes",
      prompt: "What was missed?",
      targetMs: 30_000,
    }),
    cutV1({
      id: "flow",
      artifact: "New flow",
      prompt: "Walk it.",
      targetMs: 60_000,
    }),
    cutV1({
      id: "next",
      artifact: "End card",
      prompt: "What's next?",
      targetMs: 20_000,
    }),
  ],
}

export function plan(fields: Partial<JournalPlan> = {}): JournalPlan {
  const at = new Date(NOON).toISOString()
  return {
    primer: PRIMER,
    targets: {},
    openedAt: at,
    touchedAt: at,
    ...fields,
  }
}

export function take(cutId: string, durationMs: number): JournalTake {
  return {
    cutId,
    recordedAt: new Date(NOON).toISOString(),
    durationMs,
    mimeType: "audio/webm;codecs=opus",
  }
}

/**
 * The IndexedDB store's contract, in memory: the same refusals (a take for a
 * cut the plan lacks, a take past the byte cap) and a change notice per write.
 */
export function memoryJournalStore(
  initial: {
    plan?: JournalPlan | null
    takes?: ReadonlyArray<JournalTake>
  } = {}
): {
  store: JournalStore
  state: () => JournalShelf
  audio: Map<string, Blob>
} {
  let current: JournalPlan | null = initial.plan ?? null
  const takes = new Map((initial.takes ?? []).map((each) => [each.cutId, each]))
  const audio = new Map(
    (initial.takes ?? []).map((each) => [each.cutId, new Blob(["x"])])
  )
  const listeners = new Set<() => void>()
  const changed = (): void => {
    for (const listener of listeners) listener()
  }
  const state = (): JournalShelf => ({
    plan: current,
    takes: current === null ? [] : inCutOrder(current, [...takes.values()]),
  })
  return {
    state,
    audio,
    store: {
      read: () => Promise.resolve(state()),
      audio: (cutId) => Promise.resolve(audio.get(cutId) ?? null),
      snapshot: (): Promise<JournalSnapshot> => {
        const { plan: snapPlan, takes: rows } = state()
        return Promise.resolve({
          plan: snapPlan,
          takes: rows.flatMap((each) => {
            const blob = audio.get(each.cutId)
            return blob === undefined ? [] : [{ take: each, audio: blob }]
          }),
        })
      },
      open: (next): Promise<void> => {
        current = next
        for (const id of [...takes.keys()]) {
          if (next.primer.cuts.some((cut) => cut.id === id)) continue
          takes.delete(id)
          audio.delete(id)
        }
        changed()
        return Promise.resolve()
      },
      setTargets: (targets, episode): Promise<void> => {
        if (current?.openedAt !== episode)
          return Promise.reject(new JournalStaleError())
        current = { ...current, targets }
        changed()
        return Promise.resolve()
      },
      saveTake: (kept, blob, episode): Promise<void> => {
        if (
          current?.openedAt !== episode ||
          !current.primer.cuts.some((cut) => cut.id === kept.cutId)
        )
          return Promise.reject(new JournalStaleError())
        const used = [...audio.entries()]
          .filter(([id]) => id !== kept.cutId)
          .reduce((sum, [, each]) => sum + each.size, 0)
        if (used + blob.size > JOURNAL_TAKES_MAX_BYTES)
          return Promise.reject(new JournalFullError())
        takes.set(kept.cutId, kept)
        audio.set(kept.cutId, blob)
        current = { ...current, touchedAt: kept.recordedAt }
        changed()
        return Promise.resolve()
      },
      letGo: (sent): Promise<void> => {
        if (current?.openedAt !== sent.openedAt) return Promise.resolve()
        const left = [...takes.values()].filter(
          (row) =>
            !sent.takes.some(
              (each) =>
                each.cutId === row.cutId && each.recordedAt === row.recordedAt
            )
        )
        for (const each of sent.takes) {
          if (left.some((row) => row.cutId === each.cutId)) continue
          takes.delete(each.cutId)
          audio.delete(each.cutId)
        }
        if (left.length === 0) current = null
        changed()
        return Promise.resolve()
      },
      clear: (episode): Promise<void> => {
        if (current?.openedAt !== episode) return Promise.resolve()
        current = null
        takes.clear()
        audio.clear()
        changed()
        return Promise.resolve()
      },
      subscribe: (listener) => {
        listeners.add(listener)
        return (): void => {
          listeners.delete(listener)
        }
      },
    },
  }
}
