/**
 * Kept on home: the phone keeps the settings and what home has not
 * confirmed, and lets go of a change only once home answers with it as it
 * is. Nothing it holds is dropped on the way: the device record goes only
 * once the home record carrying all of it is kept.
 */
import { newDraft, stepDraft } from "@aph/lib/draft"
import type { Draft } from "@aph/lib/draft"
import type { HomeRecord } from "@aph/lib/home"
import { sameEntry } from "@aph/lib/home"
import type { Entry } from "@aph/lib/model"
import { SEED_ENTRIES, SEED_SETTINGS } from "@aph/lib/seed"
import type { AphState } from "@aph/lib/store"
import { createAphStore } from "@aph/lib/store"
import {
  HOME_KEY,
  HOME_QUARANTINE_PREFIX,
  openHome,
  STORAGE_KEY,
} from "@aph/lib/stored"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { describe, expect, it } from "vitest"

const seed: AphState = { settings: SEED_SETTINGS, entries: SEED_ENTRIES }

function figure(value: string): Draft {
  return [...value].reduce(
    (d, digit) => stepDraft(d, { type: "digit", digit }),
    newDraft("mine", "12", null)
  )
}

const commit = { today: "2026-10-17", time: "12:10", id: "noon" }

function kept(storage: ReturnType<typeof memoryStorage>): HomeRecord {
  const opened = openHome(storage)
  if (opened.kind !== "kept") throw new Error(`home record: ${opened.kind}`)
  return opened.record
}

/** A store kept on home whose first send home took whole. */
function synced(): {
  store: ReturnType<typeof createAphStore>
  storage: ReturnType<typeof memoryStorage>
} {
  const storage = memoryStorage()
  const store = createAphStore(seed, storage)
  store.keepOnHome()
  store.sent({ settings: SEED_SETTINGS, held: SEED_ENTRIES, refused: [] })
  return { store, storage }
}

describe("keeping aph on home", () => {
  it("carries everything on the phone into the outbox before removing the device record", () => {
    const storage = memoryStorage()
    const store = createAphStore(seed, storage)
    expect(store.where()).toEqual({ kind: "device" })
    expect(store.outbox()).toBeNull()

    expect(store.keepOnHome()).toBe(true)
    expect(storage.map.has(STORAGE_KEY)).toBe(false)
    expect(kept(storage)).toEqual({
      settings: SEED_SETTINGS,
      settingsPending: true,
      pending: SEED_ENTRIES,
      refused: [],
    })
    expect(store.outbox()).toEqual({
      settings: SEED_SETTINGS,
      entries: SEED_ENTRIES,
    })
    expect(store.where()).toMatchObject({
      kind: "home",
      pulled: false,
      unsent: SEED_ENTRIES.length + 1,
    })
    expect(store.get()).toEqual(seed)
  })

  it("keeps the device record when the phone will not keep the home one", () => {
    const storage = memoryStorage()
    const store = createAphStore(seed, storage)
    storage.full = true
    expect(store.keepOnHome()).toBe(false)
    expect(store.where()).toEqual({ kind: "device" })
    expect(storage.map.has(STORAGE_KEY)).toBe(true)
  })

  it("lets go of what home answered with as it is, and of nothing else", () => {
    const storage = memoryStorage()
    const store = createAphStore(seed, storage)
    store.keepOnHome()
    const [first, second, third] = SEED_ENTRIES
    if (!first || !second || !third) throw new Error("seed")
    store.editEntry(second.id, { note: "changed after it was sent" })
    store.sent({
      settings: SEED_SETTINGS,
      held: [first, second],
      refused: [{ entry: third, why: "labels: another entry stands plain" }],
    })

    const record = kept(storage)
    expect(record.settingsPending).toBe(false)
    expect(record.pending.map((e) => e.id)).not.toContain(first.id)
    expect(
      record.pending.find((e) => e.id === second.id)?.note,
      "changed since it was sent, so still waiting"
    ).toBe("changed after it was sent")
    expect(record.refused).toEqual([
      { id: third.id, why: "labels: another entry stands plain" },
    ])
    expect(store.outbox()?.entries.map((e) => e.id)).not.toContain(third.id)
    expect(store.outbox()?.settings).toBeNull()

    store.editEntry(third.id, { labels: ["no-bs"] })
    expect(
      kept(storage).refused,
      "a change to a refused entry is a new try"
    ).toEqual([])
    expect(store.outbox()?.entries.map((e) => e.id)).toContain(third.id)
  })

  it("opens a restart on the settings and the outbox alone, then shows home's record", () => {
    const { store: first, storage } = synced()
    expect(kept(storage).pending).toEqual([])
    const saved = first.save(figure("4900"), commit)
    if (saved === null) throw new Error("saved")

    const store = createAphStore(seed, storage)
    expect(store.get()).toEqual({ settings: SEED_SETTINGS, entries: [saved] })
    expect(store.where()).toMatchObject({
      kind: "home",
      pulled: false,
      unsent: 1,
    })

    expect(
      store.pulled({ settings: SEED_SETTINGS, entries: SEED_ENTRIES })
    ).toBe(true)
    expect(store.get().entries).toEqual([...SEED_ENTRIES, saved])
    expect(store.where()).toMatchObject({ pulled: true, unsent: 1, hidden: 0 })
  })

  it("hides a waiting entry home's record has no room for, and keeps it waiting", () => {
    const { store, storage } = synced()
    const plain = SEED_ENTRIES.find(
      (e) => e.checkpoint === "12" && e.labels.length === 0
    )
    if (plain === undefined) throw new Error("a plain noon figure")
    const fresh = createAphStore(seed, storage)
    // Logged before home was read: a second plain noon figure that day.
    const clash: Entry = { ...plain, id: "clash" }
    fresh.save(figure("4400"), { ...commit, today: plain.day, id: "clash" })
    expect(
      fresh.pulled({ settings: SEED_SETTINGS, entries: SEED_ENTRIES })
    ).toBe(true)
    expect(fresh.get().entries.map((e) => e.id)).not.toContain(clash.id)
    expect(fresh.where()).toMatchObject({ hidden: 1, unsent: 1 })
    expect(store.where()).toMatchObject({ unsent: 0 })
  })

  it("refuses to show a home record that breaks a rule, leaving the screens as they were", () => {
    const { store } = synced()
    const before = store.get()
    const [first] = SEED_ENTRIES
    if (!first) throw new Error("seed")
    expect(
      store.pulled({ settings: SEED_SETTINGS, entries: [first, first] })
    ).toBe(false)
    expect(store.get()).toBe(before)
  })

  it("counts this phone's own changes only", () => {
    const { store } = synced()
    const edits = (): number => {
      const where = store.where()
      return where.kind === "home" ? where.edits : -1
    }
    const start = edits()
    store.pulled({ settings: SEED_SETTINGS, entries: SEED_ENTRIES })
    store.sent({ settings: null, held: [], refused: [] })
    expect(edits()).toBe(start)
    store.editSettings({ step: 50 })
    expect(edits()).toBe(start + 1)
    expect(store.outbox()?.settings?.step).toBe(50)
  })

  it("moves an unreadable home record aside and starts again from home's copy", () => {
    const storage = memoryStorage(new Map([[HOME_KEY, "{not json"]]))
    const store = createAphStore(seed, storage)
    expect(storage.map.get(`${HOME_QUARANTINE_PREFIX}1`)).toBe("{not json")
    expect(store.get()).toEqual({ settings: SEED_SETTINGS, entries: [] })
    expect(store.where()).toMatchObject({ kind: "home", unsent: 0 })
    expect(store.outbox()).toEqual({ settings: null, entries: [] })
  })

  it("compares entries field by field, whatever order the fields came in", () => {
    const [first] = SEED_ENTRIES
    if (!first) throw new Error("seed")
    const reordered: Entry = {
      review: first.review,
      note: first.note,
      labels: [...first.labels],
      goal: first.goal,
      theirs: first.theirs,
      mine: first.mine === null ? null : { ...first.mine },
      time: first.time,
      checkpoint: first.checkpoint,
      day: first.day,
      id: first.id,
    }
    expect(sameEntry(first, reordered)).toBe(true)
    expect(sameEntry(first, { ...first, note: "x" })).toBe(false)
  })
})
