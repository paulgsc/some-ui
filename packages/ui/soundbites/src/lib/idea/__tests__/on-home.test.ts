/** @vitest-environment node */
import { inMemoryStorage } from "@some-ui/core-utils"
import { keptIdeaLists } from "@soundbites/lib/idea/draft"
import type { Idea } from "@soundbites/lib/idea/model"
import type {
  HomeIdea,
  HomeLists,
  OnHomeEffect,
  OnHomeEvent,
  OnHomeState,
} from "@soundbites/lib/idea/on-home"
import {
  groupsOf,
  INITIAL_ON_HOME,
  isEntry,
  stepOnHome,
  withHomeWords,
} from "@soundbites/lib/idea/on-home"
import type { IdeasHome } from "@soundbites/lib/idea/on-home-runtime"
import { createIdeasOnHome } from "@soundbites/lib/idea/on-home-runtime"
import { keptIdeaStore } from "@soundbites/lib/idea/store"
import { describe, expect, it, vi } from "vitest"

function onHome(
  id: string,
  createdAt: string,
  more: Partial<HomeIdea> = {}
): HomeIdea {
  return {
    id,
    createdAt,
    revision: 1,
    sentAt: createdAt,
    title: id,
    topic: "Studio",
    format: "short",
    keywords: [],
    questions: 1,
    answers: [
      {
        question: "what",
        note: `${id}-take`,
        typed: null,
        heard: null,
        setAside: false,
      },
    ],
    furnishing: false,
    setAside: false,
    ...more,
  }
}

const A = onHome("a", "2026-11-01T09:00:00.000Z", {
  title: "Mic clips",
  keywords: ["voice", "home"],
})
const B = onHome("b", "2026-11-02T09:00:00.000Z", {
  title: "Away from home",
  topic: "LeetType",
  format: "video",
})
const C = onHome("c", "2026-11-02T18:00:00.000Z", {
  title: "Zebra",
  keywords: ["voice"],
})

const ids = (
  state: ReadonlyArray<{ ideas: ReadonlyArray<HomeIdea> }>
): Array<Array<string>> =>
  state.map((group) => group.ideas.map((idea) => idea.id))

describe("ideas on home, grouped and sorted on the phone (ST26 c)", () => {
  it("groups by subject, format, date or keyword, each idea in every keyword's group", () => {
    expect(groupsOf([C, B, A], "topic", "newest").map((g) => g.key)).toEqual([
      "Studio",
      "LeetType",
    ])
    expect(ids(groupsOf([C, B, A], "topic", "newest"))).toEqual([
      ["c", "a"],
      ["b"],
    ])
    // By title, "Away from home" comes first, so its group does.
    expect(groupsOf([C, B, A], "format", "title").map((g) => g.key)).toEqual([
      "video",
      "short",
    ])
    expect(ids(groupsOf([C, B, A], "format", "title"))).toEqual([
      ["b"],
      ["a", "c"],
    ])
    const days = groupsOf([A, B, C], "date", "oldest")
    expect(days.map((g) => g.key)).toEqual(["2026-11-02", "2026-11-01"])
    expect(ids(days)).toEqual([["b", "c"], ["a"]])
    const words = groupsOf([C, B, A], "keyword", "newest")
    expect(words.map((g) => g.key)).toEqual(["voice", null, "home"])
    expect(ids(words)).toEqual([["c", "a"], ["b"], ["a"]])
  })

  it("dates an idea by the day it was begun on this phone's calendar", () => {
    // Unstubbed, an unset TZ is unset again, not the string "undefined".
    vi.stubEnv("TZ", "America/Los_Angeles")
    try {
      // 18:30 on Nov 1 in California is already Nov 2 in UTC.
      const evening = onHome("e", "2026-11-02T01:30:00.000Z")
      expect(groupsOf([evening], "date", "newest").map((g) => g.key)).toEqual([
        "2026-11-01",
      ])
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe("home's words for a said answer, kept on the phone (ST26 c)", () => {
  const phone: Idea = {
    id: "a",
    at: A.createdAt,
    questions: 1,
    answers: [
      {
        question: "what",
        versions: [],
        takes: [{ at: A.createdAt, take: "a-take" }],
      },
    ],
    passed: [],
  }
  const heardAt = "2026-11-01T09:12:00.000Z"
  const heard = onHome("a", A.createdAt, {
    answers: [
      {
        question: "what",
        note: "a-take",
        typed: null,
        heard: { text: "Why the mic clips", heardAt },
        setAside: false,
      },
    ],
  })

  it("adds them as heard, once, and only to the answer whose take home heard", () => {
    const next = withHomeWords([phone], [heard])
    expect(next?.[0]?.answers[0]?.versions).toEqual([
      { at: heardAt, how: "heard", words: "Why the mic clips" },
    ])
    expect(withHomeWords(next ?? [], [heard])).toBeNull()
    expect(withHomeWords([phone], [A])).toBeNull()
    const silent = onHome("a", A.createdAt, {
      answers: [{ ...heard.answers[0]!, heard: { text: " ", heardAt } }],
    })
    expect(withHomeWords([phone], [silent])).toBeNull()
  })

  it("keeps them through the store, which only grows", async () => {
    const storage = inMemoryStorage()
    const ideas = keptIdeaStore(() => storage)
    ideas.keep(() => [phone])
    const home: IdeasHome = {
      ideas: () =>
        Promise.resolve({
          kind: "read",
          value: { ideas: [heard], more: false },
        }),
      lists: () =>
        Promise.resolve({
          kind: "read",
          value: { topics: ["Studio"], keywords: [] },
        }),
      furnish: vi.fn(),
      setAside: vi.fn(),
      entry: vi.fn(),
    }
    const lists = keptIdeaLists(() => storage)
    const runtime = createIdeasOnHome({ home, ideas, lists })
    const detach = runtime.attach(false)
    await vi.waitFor(() =>
      expect(ideas.list()?.[0]?.answers[0]?.versions).toHaveLength(1)
    )
    expect(runtime.getSnapshot().ideas.kind).toBe("read")
    // New idea picks from the lists as home said them.
    expect(lists.read()).toEqual({ topics: ["Studio"], keywords: [] })
    detach()
  })
})

describe("the lists as home last said them, for New idea (ST26 c)", () => {
  it("are kept from each change home takes, not only from a read", async () => {
    const storage = inMemoryStorage()
    const after = { topics: ["Studio"], keywords: ["phone"] }
    const home: IdeasHome = {
      ideas: () =>
        Promise.resolve({ kind: "read", value: { ideas: [], more: false } }),
      lists: () =>
        Promise.resolve({
          kind: "read",
          value: { topics: ["Studio"], keywords: [] },
        }),
      furnish: vi.fn(),
      setAside: vi.fn(),
      entry: () => Promise.resolve({ kind: "written", value: after }),
    }
    const lists = keptIdeaLists(() => storage)
    const runtime = createIdeasOnHome({
      home,
      ideas: keptIdeaStore(() => storage),
      lists,
    })
    const detach = runtime.attach(true)
    await vi.waitFor(() =>
      expect(runtime.getSnapshot().lists.kind).toBe("read")
    )
    runtime.dispatch({
      type: "entry",
      list: "keywords",
      name: "phone",
      listed: true,
    })
    await vi.waitFor(() => expect(runtime.getSnapshot().notice).toBe("added"))
    expect(lists.read()).toEqual(after)
    detach()
  })

  it("are kept from a change home takes after the screen is left", async () => {
    const storage = inMemoryStorage()
    const after = { topics: ["Studio"], keywords: ["phone"] }
    let land: (lists: HomeLists) => void = () => undefined
    const home: IdeasHome = {
      ideas: () =>
        Promise.resolve({ kind: "read", value: { ideas: [], more: false } }),
      lists: () =>
        Promise.resolve({
          kind: "read",
          value: { topics: ["Studio"], keywords: [] },
        }),
      furnish: vi.fn(),
      setAside: vi.fn(),
      entry: () =>
        new Promise((resolve) => {
          land = (value): void => resolve({ kind: "written", value })
        }),
    }
    const lists = keptIdeaLists(() => storage)
    const runtime = createIdeasOnHome({
      home,
      ideas: keptIdeaStore(() => storage),
      lists,
    })
    const detach = runtime.attach(true)
    await vi.waitFor(() =>
      expect(runtime.getSnapshot().lists.kind).toBe("read")
    )
    runtime.dispatch({
      type: "entry",
      list: "keywords",
      name: "phone",
      listed: true,
    })
    detach()
    land(after)
    await vi.waitFor(() => expect(lists.read()).toEqual(after))
  })
})

/** Steps `events` in order from `state`, keeping every effect. */
function run(
  state: OnHomeState,
  events: ReadonlyArray<OnHomeEvent>
): { state: OnHomeState; effects: Array<OnHomeEffect> } {
  const start: { state: OnHomeState; effects: Array<OnHomeEffect> } = {
    state,
    effects: [],
  }
  return events.reduce((acc, event) => {
    const next = stepOnHome(acc.state, event)
    return { state: next.state, effects: [...acc.effects, ...next.effects] }
  }, start)
}

const read = (seq: number, ideas: ReadonlyArray<HomeIdea>): OnHomeEvent => ({
  type: "ideasRead",
  seq,
  read: { kind: "read", value: { ideas, more: false } },
})

const lists: OnHomeEvent = {
  type: "listsRead",
  seq: 1,
  read: { kind: "read", value: { topics: ["Studio"], keywords: ["voice"] } },
}

describe("the Ideas on home machine (ST26 c)", () => {
  it("answers only the read asked for last", () => {
    const { state } = run(INITIAL_ON_HOME, [
      { type: "entered", lists: false },
      { type: "readAgain" },
      read(1, [A]),
    ])
    expect(state.ideas.kind).toBe("reading")
    expect(run(state, [read(2, [B])]).state.ideas).toEqual({
      kind: "read",
      value: { ideas: [B], more: false },
    })
  })

  it("makes one write at a time, and shows the mark as home answered it", () => {
    const opened = run(INITIAL_ON_HOME, [
      { type: "entered", lists: false },
      read(1, [A]),
      { type: "open", id: "a" },
      { type: "furnish", furnishing: true },
      { type: "furnish", furnishing: true },
    ])
    expect(opened.effects.filter((e) => e.type === "furnish")).toHaveLength(1)
    expect(opened.state.writing).toBe(true)
    const { state } = run(opened.state, [
      {
        type: "furnished",
        id: "a",
        write: { kind: "written", value: true },
      },
    ])
    expect(state.writing).toBe(false)
    expect(state.notice).toBe("furnishing")
    expect(
      state.ideas.kind === "read" && state.ideas.value.ideas[0]?.furnishing
    ).toBe(true)
    const away = run(opened.state, [
      { type: "furnished", id: "a", write: { kind: "away" } },
    ]).state
    expect(away.notice).toBe("away")
    expect(
      away.ideas.kind === "read" && away.ideas.value.ideas[0]?.furnishing
    ).toBe(false)
  })

  it("asks before setting an idea aside, and then leaves it out of the list", () => {
    const asked = run(INITIAL_ON_HOME, [
      { type: "entered", lists: false },
      read(1, [A, B]),
      { type: "open", id: "a" },
      { type: "askSetAside" },
    ])
    expect(asked.effects).not.toContainEqual({ type: "setAside", id: "a" })
    expect(asked.state.confirm).toBe("a")
    expect(run(asked.state, [{ type: "keepIt" }]).state.confirm).toBeNull()
    const done = run(asked.state, [
      { type: "confirmed" },
      {
        type: "setAsideDone",
        id: "a",
        write: { kind: "written", value: null },
      },
    ])
    expect(done.effects).toContainEqual({ type: "setAside", id: "a" })
    expect(done.state.screen).toEqual({ kind: "list" })
    expect(
      done.state.ideas.kind === "read" && done.state.ideas.value.ideas
    ).toEqual([B])
  })

  it("takes a list entry only as home would, and shows the lists home answers with", () => {
    expect(isEntry("behind the scenes")).toBe(true)
    expect(isEntry(" voice")).toBe(false)
    expect(isEntry("a/b")).toBe(false)
    expect(isEntry("x".repeat(41))).toBe(false)
    const ready = run(INITIAL_ON_HOME, [
      { type: "entered", lists: true },
      lists,
    ])
    expect(ready.state.screen).toEqual({ kind: "lists" })
    expect(
      run(ready.state, [
        { type: "entry", list: "topics", name: "a/b", listed: true },
      ]).effects
    ).toEqual([])
    const added = run(ready.state, [
      { type: "entry", list: "keywords", name: "phone", listed: true },
      {
        type: "entryDone",
        listed: true,
        write: {
          kind: "written",
          value: { topics: ["Studio"], keywords: ["voice", "phone"] },
        },
      },
    ])
    expect(added.effects).toContainEqual({
      type: "entry",
      list: "keywords",
      name: "phone",
      listed: true,
    })
    expect(added.state.lists).toEqual({
      kind: "read",
      value: { topics: ["Studio"], keywords: ["voice", "phone"] },
    })
    expect(added.state.notice).toBe("added")
  })
})
