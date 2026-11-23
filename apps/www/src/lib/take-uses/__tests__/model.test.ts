/**
 * @vitest-environment node
 *
 * What uses each take (INUSE, TU1): every source's references read as uses,
 * a source unread is never a source using nothing, and what the sheet
 * showed is told from what is new.
 */
import { describe, expect, it } from "vitest"

import type { SpokenCard } from "@/lib/studio-spoken/model"
import type { TakeUses, UseIdea, UseSources } from "@/lib/take-uses/model"
import {
  homeUses,
  NO_USES,
  unreadOf,
  unseen,
  USE_SOURCES,
  UsedBySchema,
  usesAmong,
  usesOf,
  usesOfTake,
  withHome,
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
          { rev: 1, cutList: { title: "Old", shots: [{ id: "a" }] } },
          {
            rev: 2,
            cutList: { title: "Pager", shots: [{ id: "b" }, { id: "a" }] },
          },
        ],
        chosen: { b: "p2", gone: "p9" },
        queued: [{ rev: 1, takes: [{ scene: "a", note: "p1" }] }],
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

/** An idea as a build that kept no answers left it, past its type. */
function oddIdea(): UseIdea {
  const odd: UseIdea = { id: "i2", answers: [] }
  Object.defineProperty(odd, "answers", { value: undefined })
  return odd
}

describe("what uses each take", () => {
  const uses = usesOf(ALL)

  it("reads the take each source picks, and none of its retries", () => {
    expect(usesOfTake(uses, "s3")).toEqual([
      { kind: "spoken", card: "c1", title: "Who I am", part: 1 },
    ])
    expect(usesOfTake(uses, "p2")).toEqual([
      { kind: "scene", video: "v1", title: "Pager", shot: "b", scene: 1 },
    ])
    // A shot the latest cut dropped still names its take: never unused.
    expect(usesOfTake(uses, "p9")).toEqual([
      { kind: "scene", video: "v1", title: "Pager", shot: "gone", scene: null },
    ])
    // A revision queued for home names its take though the pick moved on.
    expect(usesOfTake(uses, "p1")).toEqual([
      // Named and numbered as its own revision's cut has it.
      {
        kind: "queued",
        video: "v1",
        title: "Old",
        rev: 1,
        shot: "a",
        scene: 1,
      },
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

  it("reads a source of another build's shape as unread, never as none", () => {
    const odd = usesOf({
      ...NONE,
      ideas: {
        kind: "read",
        value: [
          ...(ALL.ideas.kind === "read" ? ALL.ideas.value : []),
          // An idea from a build that kept no answers.
          oddIdea(),
        ],
      },
    })
    expect(odd.unread).toContain("ideas")
    // What it read before the odd one stays.
    expect(usesOfTake(odd, "d2")).toHaveLength(1)
  })

  it("leaves in doubt the takes a set-aside record names, and tells the sheet when one appears", () => {
    const doubt = usesOf({
      ...ALL,
      spoken: { kind: "read", value: [], setAside: ['[{"using":"x1"}]'] },
    })
    expect(unreadOf(doubt, ["x1"])).toEqual(["spoken"])
    expect(unreadOf(doubt, ["s1"])).toEqual([])
    expect(unseen(usesOf(ALL), doubt, ["x1"])).toBe(true)
    expect(unseen(usesOf(ALL), doubt, ["w1"])).toBe(false)
  })

  it("says each source it couldn't read, never that nothing uses a take", () => {
    expect(usesOf(NONE)).toEqual({
      of: new Map(),
      unread: USE_SOURCES,
      doubts: [],
    })
    for (const source of USE_SOURCES) {
      const one = usesOf({ ...ALL, [source]: { kind: "unread" } })
      expect(one.unread).toEqual([source])
    }
  })
})

describe("a use told apart from one seen", () => {
  it("is the same use when a new cut only renumbers its scene", () => {
    const video = (shots: ReadonlyArray<string>): UseSources => ({
      ...NONE,
      videos: {
        kind: "read",
        value: [
          {
            id: "v1",
            revisions: [
              { cutList: { title: "P", shots: shots.map((id) => ({ id })) } },
            ],
            chosen: { b: "t1" },
          },
        ],
      },
    })
    const before = usesOf(video(["a", "b"]))
    const after = usesOf(video(["x", "a", "b"]))
    expect(unseen(before, { ...after, unread: before.unread }, ["t1"])).toBe(
      false
    )
  })
})

describe("what the sheet didn't show", () => {
  const used: TakeUses = usesOf({ ...NONE, ...{ spoken: ALL.spoken } })
  const read = { ...used, unread: [], doubts: [] }

  it("is nothing when the read says what was shown, or less", () => {
    expect(unseen(read, read, ["s3"])).toBe(false)
    expect(
      unseen(read, { of: new Map(), unread: [], doubts: [] }, ["s3"])
    ).toBe(false)
    // Uses of takes the sheet doesn't name are not its business.
    expect(unseen(NO_USES, read, ["s1"])).toBe(false)
  })

  it("is a new use, a store newly unread, or anything before a first read", () => {
    expect(unseen(NO_USES, read, ["s3"])).toBe(true)
    expect(
      unseen(read, { ...read, unread: ["ideas"], doubts: [] }, ["s3"])
    ).toBe(true)
    expect(
      unseen(
        { ...read, unread: ["ideas"], doubts: [] },
        { ...read, unread: ["ideas"], doubts: [] },
        ["s3"]
      )
    ).toBe(false)
    expect(unseen(null, read, ["s3"])).toBe(true)
    expect(
      unseen(null, { ...NO_USES, unread: ["rust"], doubts: [] }, ["s1"])
    ).toBe(true)
    expect(unseen(null, NO_USES, ["s1"])).toBe(false)
  })
})

describe("home's word on what plays a take", () => {
  it("reads each video, a kind it doesn't know as another, and a shape it can't read as unsaid", () => {
    expect(
      UsedBySchema.parse([
        {
          kind: "feed-video",
          key: "2026-w46",
          title: "Rust Rounds essay, 2026-w46",
          at: "x",
          withdrawsOnDelete: true,
        },
        {
          kind: "reel",
          key: "k",
          title: "",
          at: "x",
          withdrawsOnDelete: false,
        },
      ])?.map(({ kind }) => kind)
    ).toEqual(["feed-video", "other"])
    expect(UsedBySchema.parse(undefined)).toBeUndefined()
    expect(UsedBySchema.parse([{ kind: "essay" }])).toBeUndefined()
  })

  it("adds home's word to what the phone read, never in its place", () => {
    const phone = usesOf({ ...NONE, spoken: ALL.spoken })
    const said = homeUses([
      {
        kind: "essay",
        key: "e-2026-11-20",
        title: "Who I am",
        at: "x",
        withdrawsOnDelete: true,
      },
    ])
    const both = withHome(
      phone,
      new Map([
        ["s3", said],
        ["s1", []],
      ])
    )
    expect(usesOfTake(both, "s3").map((use) => use.kind)).toEqual([
      "spoken",
      "home",
    ])
    expect(usesOfTake(both, "s1")).toEqual([])
    expect(both.unread).toEqual(phone.unread)
    // A video home names now that it didn't before is new to the sheet.
    expect(unseen(phone, both, ["s3"])).toBe(true)
  })
})
