import type { RoutineFile } from "@topik/lib/topik/adapter/routine-files"
import type { AddedSet } from "@topik/lib/topik/read-aloud/added-sets"
import {
  LEVEL_ONE_LENS_SET,
  LEVEL_ONE_SET,
} from "@topik/lib/topik/read-aloud/repo-sets"
import { describe, expect, it } from "vitest"

import {
  FEED_FIRST,
  lessonItemOf,
  lessonItems,
  levelsHeld,
  searchLessons,
} from "."

const deck = (id: string, extra: Record<string, unknown> = {}): unknown => ({
  schemaVersion: 1,
  id,
  title: id,
  words: [{ id: `${id}-w`, lemma: "약속", gloss: "plans" }],
  lines: [
    {
      id: `${id}-l`,
      level: 2,
      korean: "약속",
      english: "Plans",
      words: [{ wordId: `${id}-w`, surface: "약속", stemEnd: 2 }],
    },
  ],
  ...extra,
})

const scene = (name: string, title: string): RoutineFile => ({
  kind: "scene",
  name,
  title,
  decks: [deck(`${name}-a`), deck(`${name}-b`)],
})

describe("lessonItemOf", () => {
  it("reads a scene's level, genre and name from its title, and its sets as two sessions", () => {
    const item = lessonItemOf(
      {
        kind: "scene",
        name: "scene-1.json",
        title: "TOPIK 2 · comedy · What is this test",
        decks: [
          { schemaVersion: 1, ...LEVEL_ONE_SET },
          { schemaVersion: 1, ...LEVEL_ONE_LENS_SET },
        ],
      },
      false,
      []
    )
    expect(item).toMatchObject({
      key: "scene/scene-1.json",
      kind: "scene",
      name: "What is this test",
      level: 2,
      genre: "comedy",
      opened: false,
    })
    expect(item.sessions.map((session) => session.practice)).toEqual([
      "read-aloud",
      "lens",
    ])
    expect(item.sessions[1]?.size).toBe(
      `${LEVEL_ONE_LENS_SET.lines.length} lines`
    )
  })

  it("reads a Korean genre, and keeps a title it can't split whole", () => {
    expect(
      lessonItemOf(scene("a", "TOPIK 3 · 가족 · 설날"), false, [])
    ).toMatchObject({ level: 3, genre: "family", name: "설날" })
    expect(lessonItemOf(scene("b", "약속"), false, [])).toMatchObject({
      level: undefined,
      genre: undefined,
      name: "약속",
    })
  })

  it("names a set with no practice by its place, says which the phone has opened, and drops one it can't read", () => {
    const opened = [
      {
        deck: { id: "x-a", title: "x", words: [], lines: [] },
        addedAt: "",
        openedAt: "2026-10-20T00:00:00.000Z",
      },
    ]
    const holding = (decks: ReadonlyArray<unknown>): RoutineFile => ({
      kind: "scene",
      name: "x.json",
      title: "x",
      decks,
    })
    expect(
      lessonItemOf(holding([deck("x-a"), deck("x-b")]), true, opened).sessions
    ).toMatchObject([
      { practice: "read-aloud", id: "x-a", size: "1 word", opened: true },
      { practice: "lens", id: "x-b", size: "1 line", opened: false },
    ])
    expect(
      lessonItemOf(holding([{ schemaVersion: 1 }, deck("y")]), false, [])
        .sessions
    ).toMatchObject([{ practice: "lens", id: "y" }])
  })
})

describe("searchLessons", () => {
  const items = lessonItems(
    [
      scene("1", "TOPIK 2 · comedy · What is this test"),
      scene("2", "TOPIK 1 · thriller · The clock keeps running"),
      scene("3", "TOPIK 2 · historical · Rice cakes on the road"),
      scene("4", "TOPIK 2 · family · Holiday food with grandmother"),
    ],
    new Set(["scene/1"]),
    []
  )

  it("lists the ones not opened first", () => {
    expect(items.map((item) => item.key)).toEqual([
      "scene/2",
      "scene/3",
      "scene/4",
      "scene/1",
    ])
  })

  it("lists a scene with a set still to open before one done with", () => {
    const set = (id: string): AddedSet => ({
      deck: { id, title: id, words: [], lines: [] },
      addedAt: "",
      openedAt: "2026-10-20T00:00:00.000Z",
    })
    // Scene 1 is done with; scene 2's lens set still waits.
    const ordered = lessonItems(
      [
        scene("1", "TOPIK 2 · comedy · One"),
        scene("2", "TOPIK 2 · comedy · Two"),
        scene("3", "TOPIK 2 · comedy · Three"),
      ],
      new Set(["scene/1", "scene/2"]),
      [set("1-a"), set("1-b"), set("2-a")]
    )
    expect(ordered.map((item) => item.key)).toEqual([
      "scene/3",
      "scene/2",
      "scene/1",
    ])
  })

  it("shows the first few with no query, and every match with one", () => {
    expect(searchLessons(items, "  ")).toHaveLength(FEED_FIRST)
    expect(searchLessons(items, "TOPIK 2").map((item) => item.key)).toEqual([
      "scene/3",
      "scene/4",
      "scene/1",
    ])
    expect(searchLessons(items, "2 rice").map((item) => item.key)).toEqual([
      "scene/3",
    ])
    expect(searchLessons(items, "스릴러").map((item) => item.key)).toEqual([
      "scene/2",
    ])
    expect(searchLessons(items, "grammar lens")).toHaveLength(4)
    expect(searchLessons(items, "drama")).toEqual([])
  })
})

describe("levelsHeld", () => {
  it("counts what is at each level, lowest first, and offers none nothing is at", () => {
    expect(levelsHeld([2, undefined, 1, 2, 2])).toEqual([
      { level: 1, count: 1 },
      { level: 2, count: 3 },
    ])
    expect(levelsHeld([undefined])).toEqual([])
  })
})
