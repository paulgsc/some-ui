/**
 * @vitest-environment node
 *
 * What uses each take (INUSE, TU1): every source's references read as uses,
 * a source unread is never a source using nothing, and what the sheet
 * showed is told from what is new.
 */
import { describe, expect, it } from "vitest"

import type { SpokenCard } from "@/lib/studio-spoken/model"
import type { TakeUses, UseSources } from "@/lib/take-uses/model"
import {
  NO_USES,
  unseen,
  USE_SOURCES,
  usesAmong,
  usesOf,
  usesOfTake,
} from "@/lib/take-uses/model"

const CARD: SpokenCard = {
  id: "c1",
  title: "Who I am",
  category: "introduction",
  pastedAt: "2026-11-22T10:00:00.000Z",
  parts: [
    {
      id: null,
      kind: "read",
      ask: null,
      text: "Hi.",
      takes: ["s1", "s2", "s3"],
      using: "s3",
    },
    {
      id: null,
      kind: "own",
      ask: null,
      text: "Why?",
      takes: ["s4"],
      using: null,
    },
  ],
}

const ALL: UseSources = {
  spoken: { kind: "read", value: [CARD] },
  videos: {
    kind: "read",
    value: [
      {
        id: "v1",
        revisions: [
          { cutList: { title: "Old", shots: [{ id: "a" }] } },
          { cutList: { title: "Pager", shots: [{ id: "a" }, { id: "b" }] } },
        ],
        chosen: { b: "p2", gone: "p9" },
      },
    ],
  },
  ideas: {
    kind: "read",
    value: [
      {
        id: "i1",
        about: { title: "Phones" },
        answers: [
          { question: "what", takes: [{ take: "d1" }, { take: "d2" }] },
          { question: "why" },
        ],
      },
    ],
  },
  interview: {
    kind: "read",
    value: [
      {
        week: "2026-w47",
        at: "2026-11-20T10:00:00.000Z",
        answers: [{ question: "q1", take: "w1", recordedAt: "x" }],
        reads: [{ card: "r1", take: "w2", recordedAt: "x" }],
        passed: [],
        passedReads: [],
      },
    ],
  },
  rust: {
    kind: "read",
    value: [
      {
        week: "2026-w46",
        at: "2026-11-14T10:00:00.000Z",
        answers: [{ ticket: "TB-1", take: "r1", recordedAt: "x" }],
        passed: [],
        opening: [{ n: 1, take: "r2", recordedAt: "x", version: 1, ms: 1000 }],
      },
    ],
  },
}

const NONE: UseSources = {
  spoken: { kind: "unread" },
  videos: { kind: "unread" },
  ideas: { kind: "unread" },
  interview: { kind: "unread" },
  rust: { kind: "unread" },
}

describe("what uses each take", () => {
  const uses = usesOf(ALL)

  it("reads the take each source picks, and none of its retries", () => {
    expect(usesOfTake(uses, "s3")).toEqual([
      { kind: "spoken", card: "c1", title: "Who I am", part: 1 },
    ])
    expect(usesOfTake(uses, "p2")).toEqual([
      { kind: "scene", video: "v1", title: "Pager", scene: 2 },
    ])
    // A shot the latest cut dropped still names its take: never unused.
    expect(usesOfTake(uses, "p9")).toEqual([
      { kind: "scene", video: "v1", title: "Pager", scene: null },
    ])
    expect(usesOfTake(uses, "d2")).toEqual([
      { kind: "idea", idea: "i1", title: "Phones", question: "what" },
    ])
    expect(usesOfTake(uses, "w1")).toEqual([
      { kind: "interview", week: "2026-w47", as: "answer" },
    ])
    expect(usesOfTake(uses, "w2")).toEqual([
      { kind: "interview", week: "2026-w47", as: "read" },
    ])
    expect(usesOfTake(uses, "r1")).toEqual([
      { kind: "rust", week: "2026-w46", as: "answer" },
    ])
    expect(usesOfTake(uses, "r2")).toEqual([
      { kind: "rust", week: "2026-w46", as: "opening" },
    ])
    for (const retry of ["s1", "s2", "s4", "d1"])
      expect(usesOfTake(uses, retry)).toEqual([])
    expect(uses.unread).toEqual([])
  })

  it("names a take once per use, and every use it has", () => {
    const twice = usesOf({
      ...NONE,
      spoken: {
        kind: "read",
        value: [CARD, { ...CARD, id: "c2", title: "Again" }],
      },
      interview: ALL.interview,
    })
    expect(usesOfTake(twice, "s3").map((use) => use.kind)).toEqual([
      "spoken",
      "spoken",
    ])
    expect(
      usesAmong(twice, ["s3", "w1", "s1"]).map(({ take }) => take)
    ).toEqual(["s3", "s3", "w1"])
  })

  it("says each source it couldn't read, never that nothing uses a take", () => {
    expect(usesOf(NONE)).toEqual({ of: new Map(), unread: USE_SOURCES })
    for (const source of USE_SOURCES) {
      const one = usesOf({ ...ALL, [source]: { kind: "unread" } })
      expect(one.unread).toEqual([source])
    }
  })
})

describe("what the sheet didn't show", () => {
  const used: TakeUses = usesOf({ ...NONE, ...{ spoken: ALL.spoken } })
  const read = { ...used, unread: [] }

  it("is nothing when the read says what was shown, or less", () => {
    expect(unseen(read, read, ["s3"])).toBe(false)
    expect(unseen(read, { of: new Map(), unread: [] }, ["s3"])).toBe(false)
    // Uses of takes the sheet doesn't name are not its business.
    expect(unseen(NO_USES, read, ["s1"])).toBe(false)
  })

  it("is a new use, a store newly unread, or anything before a first read", () => {
    expect(unseen(NO_USES, read, ["s3"])).toBe(true)
    expect(unseen(read, { ...read, unread: ["ideas"] }, ["s3"])).toBe(true)
    expect(
      unseen({ ...read, unread: ["ideas"] }, { ...read, unread: ["ideas"] }, [
        "s3",
      ])
    ).toBe(false)
    expect(unseen(null, read, ["s3"])).toBe(true)
    expect(unseen(null, { ...NO_USES, unread: ["rust"] }, ["s1"])).toBe(true)
    expect(unseen(null, NO_USES, ["s1"])).toBe(false)
  })
})
