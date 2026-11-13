/**
 * @vitest-environment node
 *
 * My data's Korean word sets (MD7, #2496): the page's runtime over the
 * phone's real store, so what it shows is what the phone kept.
 */
import type { PhoneWordSets, WordSetsList } from "@some-ui/topik"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { describe, expect, it, vi } from "vitest"

import { stepWordSets } from "@/lib/my-data/word-sets"
import type { WordSetsPage } from "@/lib/my-data/word-sets-runtime"
import { createWordSetsPage } from "@/lib/my-data/word-sets-runtime"

const NOW = new Date("2026-11-13T12:00:00.000Z")

const set = (id: string, openedAt: string | null = null): unknown => ({
  deck: {
    schemaVersion: 1,
    id,
    title: `Set ${id}`,
    words: [{ id: "juda", lemma: "주다", gloss: "give" }],
    lines: [
      {
        id: "give",
        level: 1,
        korean: "주세요.",
        english: "Please give it to me.",
        words: [{ wordId: "juda", surface: "주세요", stemEnd: 1 }],
      },
    ],
  },
  addedAt: "2026-10-01T00:00:00.000Z",
  openedAt,
})

/** A phone holding `sets` as an older build wrote them: no `archivedAt`. */
async function phoneWith(sets: ReadonlyArray<unknown>): Promise<PhoneWordSets> {
  // Loaded as the page loads it: topik is a lazily loaded package.
  const { phoneWordSets } = await import("@some-ui/topik")
  const storage = memoryStorage()
  storage.map.set("topik:read-aloud-sets", JSON.stringify(sets))
  return phoneWordSets(storage)
}

function pageOver(sets: PhoneWordSets): {
  page: WordSetsPage
  failed: ReturnType<typeof vi.fn>
} {
  const failed = vi.fn()
  const page = createWordSetsPage({
    open: () => Promise.resolve(sets),
    now: () => NOW,
    failed,
  })
  return { page, failed }
}

describe("My data's Korean word sets", () => {
  it("reads an older store whole, every set in use, with the hint on one opened long ago", async () => {
    const { page } = pageOver(
      await phoneWith([set("a", "2026-10-01T00:00:00.000Z"), set("b")])
    )
    await page.checkAgain()
    const state = page.getSnapshot()
    expect(state.kind).toBe("read")
    if (state.kind !== "read") return
    expect(state.list.inUse.map((row) => [row.id, row.openedLongAgo])).toEqual([
      ["a", true],
      ["b", false],
    ])
    expect(state.list.archived).toEqual([])
  })

  it("archives a set, says so with a way back, and brings it back", async () => {
    const sets = await phoneWith([set("a"), set("b")])
    const { page } = pageOver(sets)
    await page.checkAgain()
    page.archive("a")
    let state = page.getSnapshot()
    if (state.kind !== "read") throw new Error(state.kind)
    expect(state.said).toEqual({ kind: "archived", id: "a", title: "Set a" })
    expect(state.list.archived.map((row) => row.id)).toEqual(["a"])
    expect(sets.list(NOW).archived.map((row) => row.id)).toEqual(["a"])

    page.bringBack("a")
    state = page.getSnapshot()
    if (state.kind !== "read") throw new Error(state.kind)
    expect(state.said).toEqual({ kind: "broughtBack", title: "Set a" })
    expect(state.list.archived).toEqual([])
    expect(state.saidCount).toBe(2)

    page.dismiss()
    expect(page.getSnapshot()).toMatchObject({ said: null })
  })

  it("says the phone couldn't keep it when the store refuses, and shows what it kept", async () => {
    const sets = await phoneWith([set("a")])
    const { page } = pageOver({ ...sets, archive: () => false })
    await page.checkAgain()
    page.archive("a")
    expect(page.getSnapshot()).toMatchObject({
      said: { kind: "notKept" },
      list: { archived: [] },
    })
  })

  it("says there is no room when every place in use is taken", async () => {
    const sets = await phoneWith([set("a")])
    const full = {
      ...sets,
      list: (now: Date): WordSetsList => ({ ...sets.list(now), room: false }),
    }
    sets.archive("a", NOW.toISOString())
    const { page } = pageOver(full)
    await page.checkAgain()
    page.bringBack("a")
    expect(page.getSnapshot()).toMatchObject({
      said: { kind: "noRoom", limit: 50 },
    })
    expect(sets.list(NOW).archived).toHaveLength(1)
  })

  it("opens again without the last visit's notice", async () => {
    const { page } = pageOver(await phoneWith([set("a")]))
    await page.checkAgain()
    page.archive("a")
    expect(page.getSnapshot()).toMatchObject({ said: { kind: "archived" } })
    page.open()
    expect(page.getSnapshot()).toMatchObject({ said: null })
  })

  it("says there is no room when the phone filled since the list was read", async () => {
    const sets = await phoneWith([set("a")])
    sets.archive("a", NOW.toISOString())
    let full = false
    const filling: PhoneWordSets = {
      ...sets,
      list: (now: Date): WordSetsList => ({ ...sets.list(now), room: !full }),
      bringBack: (id) => !full && sets.bringBack(id),
    }
    const { page } = pageOver(filling)
    await page.checkAgain()
    full = true
    page.bringBack("a")
    expect(page.getSnapshot()).toMatchObject({ said: { kind: "noRoom" } })
  })

  it("says the sets couldn't be read, reports it, and reads them on a drag down", async () => {
    const sets = await phoneWith([set("a")])
    let opens = 0
    const failed = vi.fn()
    const page = createWordSetsPage({
      open: () => {
        opens += 1
        return opens === 1
          ? Promise.reject(new Error("no store"))
          : Promise.resolve(sets)
      },
      now: () => NOW,
      failed,
    })
    await expect(page.checkAgain()).rejects.toThrow("no store")
    expect(page.getSnapshot()).toEqual({ kind: "unread" })
    expect(failed).toHaveBeenCalledOnce()
    await page.checkAgain()
    expect(page.getSnapshot().kind).toBe("read")
  })

  it("does nothing for a set it hasn't shown", async () => {
    const { page } = pageOver(await phoneWith([set("a")]))
    page.archive("a")
    expect(page.getSnapshot()).toEqual({ kind: "reading" })
    await page.checkAgain()
    page.archive("missing")
    expect(page.getSnapshot()).toMatchObject({ said: null })
  })

  it("keeps a read list when a later read fails", () => {
    const list = { inUse: [], archived: [], limit: 50, room: true }
    const read = stepWordSets({ kind: "reading" }, { type: "read", list })
    expect(stepWordSets(read, { type: "unread" })).toBe(read)
  })
})
