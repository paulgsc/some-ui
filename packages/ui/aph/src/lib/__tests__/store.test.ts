/**
 * The store's rules, held under any sequence of edits, not only the ones a
 * test author thought of: random sequences of everything the screens can do,
 * checked after every step against `violations` (the state) and `breaches`
 * (the step).
 *
 * Their figure is aimed at any entry, filled or not, the way a stale link or
 * a Back press aims it. Replacing a reported figure leaves a valid state, so
 * only `breaches`, which judges the step, catches it.
 *
 * Mine is aimed at days in and out of the two weeks a missed figure can
 * still be logged on, and every step is kept: a store opened afresh on the
 * same storage, as after a restart, finds exactly what the screens showed.
 */
import { newDraft, stepDraft } from "@aph/lib/draft"
import type { Draft, DraftEvent } from "@aph/lib/draft"
import type { Entry } from "@aph/lib/model"
import { breaches, violations } from "@aph/lib/model"
import { SEED_ENTRIES, SEED_SETTINGS } from "@aph/lib/seed"
import { createAphStore } from "@aph/lib/store"
import { describe, expect, it } from "vitest"

import { memoryStorage } from "./memory-storage"

const settings = SEED_SETTINGS

/** A small seeded generator (mulberry32), so a failure replays exactly. */
function random(seed: number): () => number {
  let a = seed
  return (): number => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(next: () => number, from: ReadonlyArray<T>): T | undefined {
  return from[Math.floor(next() * from.length)]
}

function someLabels(next: () => number): Array<string> {
  return settings.labels.filter(() => next() < 0.3)
}

const TODAY = "2026-10-03"
/** Today, two within reach, and one (18 days back) past it. */
const DAYS = [null, "2026-10-01", "2026-10-02", "2026-09-15"]

function figure(next: () => number): Array<DraftEvent> {
  return [...String(3000 + Math.floor(next() * 3500))].map((digit) => ({
    type: "digit",
    digit,
  }))
}

describe("the store's rules, under random edits", () => {
  it("holds for the paper notes it starts from", () => {
    expect(violations(settings, SEED_ENTRIES)).toEqual([])
  })

  it("catches a second plain figure at a checkpoint", () => {
    const plain = SEED_ENTRIES.find(
      (e) => e.checkpoint === "7" && e.labels.length === 0
    )
    if (plain === undefined) throw new Error("a plain morning figure")
    const twice: Array<Entry> = [...SEED_ENTRIES, { ...plain, id: "copy" }]
    expect(violations(settings, twice)).toEqual([
      `copy: a second plain figure at ${plain.day} 7`,
    ])
  })

  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`holds after every one of 400 random edits (seed ${seed})`, () => {
      const next = random(seed)
      const storage = memoryStorage()
      const store = createAphStore({ settings, entries: SEED_ENTRIES }, storage)
      for (let step = 0; step < 400; step += 1) {
        const { entries } = store.get()
        const before = entries
        const kind = Math.floor(next() * 5)
        if (kind === 0 || kind === 1) {
          // Mine: at a checkpoint or not, with or without labels.
          const checkpoint =
            pick(next, [...settings.checkpoints.map((c) => c.id), null]) ?? null
          let draft: Draft = newDraft(
            "mine",
            checkpoint,
            null,
            pick(next, DAYS) ?? null
          )
          for (const event of figure(next)) draft = stepDraft(draft, event)
          for (const label of someLabels(next)) {
            draft = stepDraft(draft, { type: "toggleLabel", label })
          }
          store.save(draft, {
            today: TODAY,
            time: "16:05",
            id: `r${seed}-${step}`,
          })
        } else if (kind === 2) {
          const target = pick(next, entries)
          if (target !== undefined) {
            let draft: Draft = newDraft("theirs", null, target.id)
            for (const event of figure(next)) draft = stepDraft(draft, event)
            store.save(draft, { today: TODAY, time: "", id: "unused" })
          }
        } else if (kind === 3) {
          const target = pick(next, entries)
          if (target !== undefined) {
            store.editEntry(target.id, { labels: someLabels(next) })
          }
        } else {
          const target = pick(next, entries)
          if (target !== undefined) {
            store.review(
              target.id,
              pick(next, ["agreed", "flagged", null]) ?? null
            )
          }
        }
        expect(
          violations(settings, store.get().entries),
          `step ${step}`
        ).toEqual([])
        expect(breaches(before, store.get().entries), `step ${step}`).toEqual(
          []
        )
        const reopened = createAphStore({ settings, entries: [] }, storage)
        expect(reopened.get(), `step ${step}`).toEqual(store.get())
      }
    })
  }
})
