/**
 * @vitest-environment jsdom
 *
 * SFEED6 (#2745): the phone's notes are append-only, and refuse once full
 * rather than making room (CLAUDE.md, "Never lose the record").
 */
import { beforeEach, describe, expect, it } from "vitest"

import type { Note } from "@/lib/episode-feedback"
import { episodeFeedback, MAX_NOTES, notesOn } from "@/lib/episode-feedback"
import { keepNote, readNotes } from "@/lib/episode-feedback/store"

const note = (id: string, episode = "2026-11-13"): Note => ({
  id,
  feed: "call",
  episode,
  atMs: 1000,
  categories: ["pacing"],
  writtenAt: "2026-11-14T03:00:00.000Z",
})

beforeEach(() => {
  localStorage.clear()
})

describe("the phone's notes", () => {
  it("keeps each after the others, once", () => {
    expect(keepNote(note("a"))).toBe(true)
    expect(keepNote(note("b"))).toBe(true)
    expect(keepNote(note("a"))).toBe(true)
    expect(readNotes().map((n) => n.id)).toEqual(["a", "b"])
  })

  it("refuses a new note once full, and drops none", () => {
    const full = Array.from({ length: MAX_NOTES }, (_, i) => note(`n${i}`))
    localStorage.setItem("some-ui:episode-feedback", JSON.stringify(full))
    expect(keepNote(note("one-more"))).toBe(false)
    expect(readNotes()).toHaveLength(MAX_NOTES)
    expect(readNotes()[0]?.id).toBe("n0")
  })

  it("copies an unreadable value aside before writing over it", () => {
    localStorage.setItem("some-ui:episode-feedback", "not json")
    expect(keepNote(note("a"))).toBe(true)
    expect(localStorage.getItem("some-ui:episode-feedback:unreadable:1")).toBe(
      "not json"
    )
  })

  it("tells a screen when one is kept, and lists an episode's own", () => {
    let told = 0
    const stop = episodeFeedback.subscribe(() => (told += 1))
    episodeFeedback.keep(note("a"))
    episodeFeedback.keep(note("b", "2026-11-06"))
    stop()
    expect(told).toBe(2)
    const all = episodeFeedback.getSnapshot()
    expect(episodeFeedback.getSnapshot()).toBe(all)
    expect(notesOn(all, "call", "2026-11-13").map((n) => n.id)).toEqual(["a"])
  })
})
