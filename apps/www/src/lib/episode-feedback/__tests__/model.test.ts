/**
 * @vitest-environment node
 *
 * SFEED6 (#2745): the note being written on an episode's page. Where each
 * category goes is `@some-ui/video-render`'s, tested there.
 */
import { describe, expect, it } from "vitest"

import type { Category, Draft } from "@/lib/episode-feedback"
import {
  CLOSED,
  keepable,
  momentOf,
  noteOf,
  NoteSchema,
  step,
} from "@/lib/episode-feedback"

const open = (picked: ReadonlyArray<Category> = []): Draft => ({
  kind: "open",
  atMs: 134_000,
  picked,
  refused: null,
})

describe("the note being written", () => {
  it("opens at the moment the video stood at, and keeps it", () => {
    const opened = step(CLOSED, { type: "opened", atMs: 134_000 })
    expect(opened).toEqual(open())
    expect(step(open(["pacing"]), { type: "opened", atMs: 9 })).toEqual(
      open(["pacing"])
    )
  })

  it("toggles a category on and off, in the set's order", () => {
    let draft = step(open(), { type: "toggled", category: "voice" })
    draft = step(draft, { type: "toggled", category: "shallow" })
    expect(draft).toEqual(open(["shallow", "voice"]))
    expect(step(draft, { type: "toggled", category: "voice" })).toEqual(
      open(["shallow"])
    )
    expect(step(CLOSED, { type: "toggled", category: "voice" })).toBe(CLOSED)
  })

  it("closes once kept, and stays open with its picks when refused", () => {
    expect(step(open(["voice"]), { type: "kept", came: "kept" })).toBe(CLOSED)
    const refused = step(open(["voice"]), { type: "kept", came: "full" })
    expect(refused).toEqual({ ...open(["voice"]), refused: "full" })
    expect(step(refused, { type: "toggled", category: "pacing" })).toEqual(
      open(["pacing", "voice"])
    )
    expect(step(open(["voice"]), { type: "cancelled" })).toBe(CLOSED)
  })

  it("can be kept only with something picked", () => {
    expect(keepable(CLOSED)).toBe(false)
    expect(keepable(open())).toBe(false)
    expect(keepable(open(["tooShort"]))).toBe(true)
  })

  it("becomes a note", () => {
    const where = { feed: "call", episode: "2026-11-13" } as const
    const made = { id: "n1", now: new Date("2026-11-14T03:00:00Z") }
    expect(noteOf(open(), where, made)).toBeNull()
    const note = noteOf(open(["overlap"]), where, made)
    expect(note).toEqual({
      id: "n1",
      feed: "call",
      episode: "2026-11-13",
      atMs: 134_000,
      categories: ["overlap"],
      writtenAt: "2026-11-14T03:00:00.000Z",
    })
  })

  it("reads back a stored note only with its picks each once, in order", () => {
    const note = {
      id: "n1",
      feed: "call",
      episode: "2026-11-13",
      atMs: 0,
      categories: ["shallow", "voice"],
      writtenAt: "2026-11-14T03:00:00.000Z",
    }
    expect(NoteSchema.safeParse(note).success).toBe(true)
    for (const categories of [["voice", "shallow"], ["voice", "voice"], []]) {
      expect(NoteSchema.safeParse({ ...note, categories }).success).toBe(false)
    }
    expect(
      NoteSchema.safeParse({ ...note, writtenAt: "Tuesday" }).success
    ).toBe(false)
  })

  it("reads a player's seconds as whole milliseconds, never below zero", () => {
    expect(momentOf(134.5678)).toBe(134_567)
    expect(momentOf(Number.NaN)).toBe(0)
    expect(momentOf(-2)).toBe(0)
  })
})
