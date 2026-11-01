/** @vitest-environment node */
import { inMemoryStorage } from "@some-ui/core-utils"
import type { Idea } from "@soundbites/lib/idea/model"
import {
  stageOf,
  waiting,
  withAside,
  withPassed,
  withReply,
} from "@soundbites/lib/idea/model"
import type { ShelfIntent, ShelfState } from "@soundbites/lib/idea/shelf"
import {
  ideaOnScreen,
  initialShelfState,
  shelved,
  step,
  videoFrom,
  videosOf,
} from "@soundbites/lib/idea/shelf"
import type {
  ShelfPorts,
  ShelfRuntime,
} from "@soundbites/lib/idea/shelf-runtime"
import { createIdeaShelf } from "@soundbites/lib/idea/shelf-runtime"
import { keptIdeaStore } from "@soundbites/lib/idea/store"
import { projectFile, readProjectFile } from "@soundbites/lib/project/file"
import { memoryProjectStore } from "@soundbites/lib/project/memory-store"
import { latest } from "@soundbites/lib/project/model"
import { describe, expect, it } from "vitest"

import { AT, caught, DRAFT, LATER, replyText } from "./fixture"

const blob = (text: string): Blob => new Blob([text])

/** Settles the runtime's pending reads and writes. */
const settle = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

function shelf(
  ideas: ReadonlyArray<Idea> = [caught()],
  ports: Partial<ShelfPorts> = {}
): {
  runtime: ShelfRuntime
  store: ReturnType<typeof keptIdeaStore>
  projects: ReturnType<typeof memoryProjectStore>
} {
  const storage = inMemoryStorage()
  const store = keptIdeaStore(() => storage)
  store.keep(() => ideas)
  const projects = memoryProjectStore()
  const runtime = createIdeaShelf({
    ideas: store,
    projects: projects.store,
    now: () => Date.parse(LATER),
    readText: (file) => file.text(),
    ...ports,
  })
  runtime.attach()
  return { runtime, store, projects }
}

/** `fleshed()` with Claude's one question about it skipped. */
function skippedAsk(): Idea {
  const asked = withReply(fleshed(), { primer: null, ask: ["Which week?"] }, AT)
  if (asked === null) throw new Error("asked")
  return withPassed(asked, "ask-1")
}

function fleshed(): Idea {
  const reading = withReply(
    caught(),
    {
      primer: {
        title: "Week 8 picks",
        budgetMs: 360_000,
        voice: "ad-lib",
        cuts: [
          {
            id: "path",
            artifact: "The path card",
            point: "Following the model paid off",
            line: null,
            keep: [],
            voice: "ad-lib",
            prompt: "Following the model paid off",
            targetMs: 20_000,
            from: ["spark", "what"],
          },
          {
            id: "next",
            artifact: "End card",
            point: "What week 9 tests",
            line: null,
            keep: [],
            voice: "ad-lib",
            prompt: "What week 9 tests",
            targetMs: 10_000,
          },
        ],
      },
      ask: [],
    },
    AT
  )
  if (reading === null) throw new Error("kept")
  return reading
}

describe("where an idea is", () => {
  it("is just the idea, then fleshed out, then a video; set aside outranks them", () => {
    const none = new Set<string>()
    expect(stageOf(caught(), none)).toBe("idea")
    expect(stageOf(fleshed(), none)).toBe("fleshed")
    expect(stageOf(fleshed(), new Set(["idea-1"]))).toBe("video")
    expect(stageOf(withAside(fleshed(), true, AT), none)).toBe("aside")
    expect(
      stageOf(withAside(withAside(caught(), true, AT), false, LATER), none)
    ).toBe("idea")
  })

  it("lists the newest first, with the ones set aside apart", () => {
    const state: ShelfState = {
      ...initialShelfState(),
      ideas: [caught("a"), withAside(caught("b"), true, AT), caught("c")],
    }
    expect(shelved(state, false).map((idea) => idea.id)).toEqual(["c", "a"])
    expect(shelved(state, true).map((idea) => idea.id)).toEqual(["b"])
  })
})

describe("making a video from an idea", () => {
  it("starts it from Claude's latest scenes, each scene citing the answer it came from", () => {
    const project = videoFrom(fleshed(), LATER)
    if (project === null) throw new Error("made")
    const first = latest(project)
    expect(first.rev).toBe(1)
    expect(first.author).toBe("claude")
    expect(first.primer?.idea).toBe("idea-1")
    expect(first.cutList.shots.map((shot) => shot.idea)).toEqual([
      { origin: "you", from: { kind: "idea", id: "idea-1/spark" } },
      { origin: "agent" },
    ])
    expect(videosOf([project])).toEqual([
      { project: project.id, idea: "idea-1" },
    ])
    expect(videoFrom(caught(), LATER)).toBeNull()
    // It reads back whole, as a session's version of it must.
    const back = readProjectFile(projectFile(project))
    expect(back.ok && back.value).toEqual(project)
  })
})

describe("the idea shelf", () => {
  it("keeps what Claude made of an idea with it, and makes the video once", async () => {
    const { runtime, store, projects } = shelf()
    await settle()
    runtime.dispatch({ type: "opened", id: "idea-1" })
    runtime.dispatch({
      type: "replyPicked",
      file: blob(replyText({ primer: DRAFT })),
    })
    await settle()
    expect(runtime.getSnapshot().notice).toBe("replied")
    expect(store.list()?.[0]?.drafts).toHaveLength(1)

    runtime.dispatch({ type: "makeChosen" })
    runtime.dispatch({ type: "makeChosen" })
    await settle()
    expect(runtime.getSnapshot().notice).toBe("made")
    expect(projects.projects.size).toBe(1)
    const state = runtime.getSnapshot()
    const idea = ideaOnScreen(state)
    if (idea === null) throw new Error("on screen")
    expect(stageOf(idea, new Set(state.videos?.map((v) => v.idea)))).toBe(
      "video"
    )
    runtime.dispatch({ type: "makeChosen" })
    await settle()
    expect(projects.projects.size).toBe(1)
  })

  it("asks Claude's questions only when asked for, and keeps them on the idea", async () => {
    const { runtime, store } = shelf()
    await settle()
    runtime.dispatch({ type: "opened", id: "idea-1" })
    runtime.dispatch({
      type: "replyPicked",
      file: blob(replyText({ ask: ["Which week?"] })),
    })
    await settle()
    expect(runtime.getSnapshot().notice).toBe("asked")
    expect(store.list()?.[0]?.asked).toEqual([
      { id: "ask-1", at: LATER, words: "Which week?" },
    ])
    runtime.dispatch({ type: "answerChosen" })
    expect(runtime.getSnapshot().screen).toEqual({
      kind: "answering",
      id: "idea-1",
    })
    runtime.dispatch({ type: "back" })
    expect(runtime.getSnapshot().screen).toEqual({ kind: "idea", id: "idea-1" })
  })

  it("says what is wrong with a pick and keeps nothing", async () => {
    const { runtime, store } = shelf([caught(), caught("idea-2")])
    await settle()
    runtime.dispatch({ type: "opened", id: "idea-1" })
    for (const [text, notice] of [
      [replyText({ ask: ["?"] }, "idea-2"), "otherIdea"],
      [JSON.stringify(DRAFT), "notReply"],
      [replyText({}), "wrongReply"],
    ] as const) {
      runtime.dispatch({ type: "replyPicked", file: blob(text) })
      await settle()
      expect(runtime.getSnapshot().notice).toBe(notice)
    }
    expect(store.list()?.every((idea) => idea.asked === undefined)).toBe(true)
  })

  it("sets an idea aside as a mark, and brings it back", async () => {
    const { runtime, store } = shelf()
    await settle()
    runtime.dispatch({ type: "opened", id: "idea-1" })
    runtime.dispatch({ type: "asideChosen" })
    runtime.dispatch({ type: "backChosen" })
    expect(store.list()?.[0]?.shelved?.map((each) => each.aside)).toEqual([
      true,
      false,
    ])
    expect(store.list()?.[0]?.answers).toHaveLength(2)
  })

  it("answers only the latest pick", () => {
    let state: ShelfState = {
      ...initialShelfState(),
      ideas: [caught()],
      screen: { kind: "idea", id: "idea-1" },
    }
    state = step(state, { type: "replyPicked", file: blob(""), at: AT }).state
    state = step(state, { type: "replyPicked", file: blob(""), at: AT }).state
    const late = step(state, {
      type: "replyRead",
      seq: 1,
      text: replyText({ ask: ["?"] }),
      at: AT,
    })
    expect(late.effects).toEqual([])
    const unreadable = step(state, { type: "replyUnreadable", seq: 1 })
    expect(unreadable.state.notice).toBeNull()
  })

  it("makes no video until it knows none began from the idea", () => {
    const open: ShelfState = {
      ...initialShelfState(),
      ideas: [fleshed()],
      screen: { kind: "idea", id: "idea-1" },
    }
    const make = { type: "makeChosen", at: LATER } as const
    expect(step(open, make).effects).toEqual([])
    expect(
      step({ ...open, videos: [{ project: "p", idea: "idea-1" }] }, make)
        .effects
    ).toEqual([])
    expect(step({ ...open, videos: [] }, make).effects).toMatchObject([
      { type: "create" },
    ])
  })

  it("lets a skipped question of Claude's wait on nothing: the video can still be made", () => {
    const idea = skippedAsk()
    expect(waiting(idea)).toBe(0)
    const open: ShelfState = {
      ...initialShelfState(),
      ideas: [idea],
      videos: [],
      screen: { kind: "idea", id: "idea-1" },
    }
    expect(step(open, { type: "makeChosen", at: LATER }).effects).toMatchObject(
      [{ type: "create" }]
    )
    // And it can still be answered, from the idea.
    expect(
      step(open, { type: "answerChosen", at: LATER }).state.screen
    ).toEqual({ kind: "answering", id: "idea-1" })
  })

  it("keeps a reply picked twice once, and says it's kept already", async () => {
    const { runtime, store } = shelf()
    await settle()
    runtime.dispatch({ type: "opened", id: "idea-1" })
    const reply = replyText({ primer: DRAFT, ask: ["Which week?"] })
    runtime.dispatch({ type: "replyPicked", file: blob(reply) })
    await settle()
    expect(runtime.getSnapshot().notice).toBe("replied")
    runtime.dispatch({ type: "replyPicked", file: blob(reply) })
    await settle()
    expect(runtime.getSnapshot().notice).toBe("alreadyKept")
    const kept = store.list()?.[0]
    expect(kept?.asked?.map((each) => each.id)).toEqual(["ask-1"])
    expect(kept?.drafts).toHaveLength(1)
    // A new question beside the same scenes adds only the question.
    runtime.dispatch({
      type: "replyPicked",
      file: blob(
        replyText({ primer: DRAFT, ask: ["Which week?", "Why now?"] })
      ),
    })
    await settle()
    expect(runtime.getSnapshot().notice).toBe("asked")
    expect(store.list()?.[0]?.asked?.map((each) => each.words)).toEqual([
      "Which week?",
      "Why now?",
    ])
    expect(store.list()?.[0]?.drafts).toHaveLength(1)
  })

  it("says it's kept already when the phone had the reply before this screen did", async () => {
    const first = shelf()
    await settle()
    // A second screen over the same ideas, read before the first one kept it.
    const second = createIdeaShelf({
      ideas: first.store,
      projects: first.projects.store,
      now: () => Date.parse(LATER),
      readText: (file) => file.text(),
    })
    second.attach()
    await settle()
    const reply = replyText({ ask: ["Which week?"] })
    for (const runtime of [first.runtime, second]) {
      runtime.dispatch({ type: "opened", id: "idea-1" })
      runtime.dispatch({ type: "replyPicked", file: blob(reply) })
      await settle()
    }
    expect(first.runtime.getSnapshot().notice).toBe("asked")
    expect(second.getSnapshot().notice).toBe("alreadyKept")
    expect(first.store.list()?.[0]?.asked).toHaveLength(1)
  })

  it("makes one video however quickly Make is tapped again, before the videos are read again", async () => {
    let clock = Date.parse(LATER)
    let reads = 0
    const memory = memoryProjectStore()
    const { runtime } = shelf([fleshed()], {
      projects: {
        update: (id, change) => memory.store.update(id, change),
        // The first read lands; every later one never does.
        list: () =>
          reads++ === 0 ? memory.store.list() : new Promise(() => undefined),
      },
      now: () => clock++,
    })
    await settle()
    runtime.dispatch({ type: "opened", id: "idea-1" })
    runtime.dispatch({ type: "makeChosen" })
    await settle()
    expect(runtime.getSnapshot().notice).toBe("made")
    runtime.dispatch({ type: "makeChosen" })
    await settle()
    expect(memory.projects.size).toBe(1)
  })

  it("says so when the phone's videos can't be read, and reads them again", () => {
    const open: ShelfState = {
      ...initialShelfState(),
      ideas: [fleshed()],
      screen: { kind: "idea", id: "idea-1" },
    }
    const unread = step(open, { type: "videosListed", videos: null }).state
    expect(unread.videosUnread).toBe(true)
    expect(step(unread, { type: "makeChosen", at: LATER }).effects).toEqual([])
    const again = step(unread, { type: "videosAgain", at: LATER })
    expect(again.state.videosUnread).toBe(false)
    expect(again.effects).toEqual([{ type: "readVideos" }])
    const read = step(again.state, { type: "videosListed", videos: [] }).state
    expect(step(read, { type: "makeChosen", at: LATER }).effects).toMatchObject(
      [{ type: "create" }]
    )
  })

  it("drops a pick's read that lands once another idea is open", () => {
    let state: ShelfState = {
      ...initialShelfState(),
      ideas: [caught(), caught("idea-2")],
      screen: { kind: "list", aside: false },
    }
    const tap = (event: ShelfIntent): void => {
      state = step(state, { ...event, at: AT }).state
    }
    tap({ type: "opened", id: "idea-1" })
    tap({ type: "replyPicked", file: blob("") })
    const seq = state.pickSeq
    tap({ type: "back" })
    tap({ type: "opened", id: "idea-2" })
    const late = step(state, {
      type: "replyRead",
      seq,
      text: replyText({ ask: ["?"] }),
      at: AT,
    })
    expect(late.effects).toEqual([])
    expect(late.state.notice).toBeNull()
    expect(
      step(state, { type: "replyUnreadable", seq }).state.notice
    ).toBeNull()
  })

  it("goes back to the list when the idea on screen is no longer kept", () => {
    const open: ShelfState = {
      ...initialShelfState(),
      ideas: [caught(), caught("idea-2")],
      screen: { kind: "idea", id: "idea-2" },
    }
    const read = step(open, { type: "listed", ideas: [caught()] }).state
    expect(read.screen).toEqual({ kind: "list", aside: false })
    expect(
      step(read, { type: "opened", id: "idea-1", at: AT }).state.screen
    ).toEqual({ kind: "idea", id: "idea-1" })
  })

  it("ST26: gives a said answer home's words once home has heard it, and asks again while it hasn't", async () => {
    const said: Idea = {
      id: "idea-2",
      at: AT,
      questions: 1,
      answers: [
        {
          question: "what",
          versions: [],
          takes: [
            { at: AT, take: "t1" },
            { at: AT, take: "t2" },
          ],
        },
        { question: "spark", versions: [], takes: [{ at: AT, take: "t3" }] },
      ],
      passed: [],
      about: {
        title: "Two hearings",
        topic: null,
        keywords: [],
        format: "short",
      },
      sent: [AT],
    }
    const asked: Array<string> = []
    const on = shelf([said], {
      heard: (take) => {
        asked.push(take)
        return Promise.resolve(
          take === "t2"
            ? { kind: "heard", text: " two hearings, one word " }
            : { kind: "notYet" }
        )
      },
    })
    await settle()
    // The answer's take now, not an earlier one; and every answer without words.
    expect(asked).toEqual(["t2", "t3"])
    const [kept] = on.store.list() ?? []
    expect(kept?.answers[0]?.versions).toEqual([
      { at: LATER, how: "heard", words: "two hearings, one word" },
    ])
    expect(kept?.answers[1]?.versions).toEqual([])
    // Read again, only the one still without words is asked about.
    on.runtime.dispatch({ type: "readAgain" })
    await settle()
    expect(asked).toEqual(["t2", "t3", "t3"])
  })

  it("says so when the kept ideas can't be read", () => {
    const loading = step(initialShelfState(), { type: "entered", at: AT })
    expect(
      step(loading.state, { type: "listed", ideas: null }).state.screen
    ).toEqual({ kind: "unreadable" })
  })
})
