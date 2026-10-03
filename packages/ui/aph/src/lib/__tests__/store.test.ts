/**
 * The store's rules, held under any sequence of edits, not only the ones a
 * test author thought of. Three review rounds on #1659 each found a new path
 * to the same broken state (a second plain figure at a checkpoint) because
 * the rule lived in comments and each path had to remember it. Now it lives
 * in `violations`, the store refuses a write that breaks it, and this throws
 * random sequences of everything the screens can do at the store and checks
 * after every step that nothing got through.
 */
import { newDraft, stepDraft } from "@aph/lib/draft"
import type { Draft, DraftEvent } from "@aph/lib/draft"
import type { Entry } from "@aph/lib/model"
import { violations } from "@aph/lib/model"
import { SEED_ENTRIES, SEED_SETTINGS } from "@aph/lib/seed"
import { createAphStore } from "@aph/lib/store"
import { describe, expect, it } from "vitest"

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

const DAYS = ["2026-10-01", "2026-10-02", "2026-10-03"]

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
      const store = createAphStore({ settings, entries: SEED_ENTRIES })
      for (let step = 0; step < 400; step += 1) {
        const { entries } = store.get()
        const kind = Math.floor(next() * 5)
        if (kind === 0 || kind === 1) {
          // Mine: at a checkpoint or not, with or without labels.
          const checkpoint =
            pick(next, [...settings.checkpoints.map((c) => c.id), null]) ?? null
          let draft: Draft = newDraft("mine", checkpoint, null)
          for (const event of figure(next)) draft = stepDraft(draft, event)
          for (const label of someLabels(next)) {
            draft = stepDraft(draft, { type: "toggleLabel", label })
          }
          store.save(draft, {
            day: pick(next, DAYS) ?? "2026-10-03",
            time: "16:05",
            id: `r${seed}-${step}`,
          })
        } else if (kind === 2) {
          const target = pick(next, entries)
          if (target !== undefined) {
            let draft: Draft = newDraft("theirs", null, target.id)
            for (const event of figure(next)) draft = stepDraft(draft, event)
            store.save(draft, { day: target.day, time: "", id: "unused" })
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
      }
    })
  }
})
