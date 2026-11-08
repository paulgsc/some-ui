/**
 * @vitest-environment jsdom
 *
 * An answer of an idea already on home, said again (ST26, #2579): its take
 * waits on the phone, on a desk of its own, until the idea is sent again;
 * then the idea only grows (the new take after the answer's takes, a send
 * after its sends), the take it replaces is set aside on home, and the new
 * one goes. Over every ordering of saying it again, sending it again and
 * leaving: the real take pattern on the shared simulated microphone, the
 * real idea store in a page's storage.
 */
import { inMemoryStorage } from "@some-ui/core-utils"
import type { PatternTake } from "@some-ui/voice-capture"
import { ONE_TAKE } from "@some-ui/voice-capture"
import type { SimulatedPattern } from "@some-ui/voice-capture/testing"
import { simulatedPattern } from "@some-ui/voice-capture/testing"
import { bundleTakesOf } from "@soundbites/fixtures"
import { createIdeaBundle } from "@soundbites/lib/idea/bundle-runtime"
import {
  answersOf,
  IDEA_LISTS_SEED,
  keptDraftStore,
  keptIdeaLists,
} from "@soundbites/lib/idea/draft"
import type { Idea } from "@soundbites/lib/idea/model"
import { grows } from "@soundbites/lib/idea/model"
import type {
  HomeIdea,
  OnHomeEvent,
  OnHomeState,
} from "@soundbites/lib/idea/on-home"
import {
  INITIAL_ON_HOME,
  openRedos,
  sentAgainTake,
  stepOnHome,
  withHomeWords,
} from "@soundbites/lib/idea/on-home"
import type {
  IdeasHome,
  OnHomeRuntime,
} from "@soundbites/lib/idea/on-home-runtime"
import { createIdeasOnHome } from "@soundbites/lib/idea/on-home-runtime"
import {
  cutShort,
  overtaken,
  sayable,
  sendAgain,
  waitingRedos,
} from "@soundbites/lib/idea/redo"
import type { IdeaStore } from "@soundbites/lib/idea/store"
import { keptIdeaStore } from "@soundbites/lib/idea/store"
import type { Mock } from "vitest"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const AT = "2026-11-01T09:00:00.000Z"
const LATER = "2026-11-08T10:00:00.000Z"
const LINE = answersOf("idea-1", "what")

/** An idea sent whole: its first answer said (take `t0`), one typed. */
const SENT: Idea = {
  id: "idea-1",
  at: AT,
  questions: 1,
  answers: [
    { question: "what", versions: [], takes: [{ at: AT, take: "t0" }] },
    {
      question: "spark",
      versions: [{ at: AT, how: "typed", words: "the bus home" }],
    },
  ],
  passed: [],
  about: { title: "Mic clips", topic: "Studio", keywords: [], format: "short" },
  sent: [AT],
}

/** The idea as home holds it: `note` answers what the video is. */
function onHome(
  note = "t0",
  more: Partial<HomeIdea["answers"][0]> = {}
): HomeIdea {
  return {
    id: "idea-1",
    createdAt: AT,
    revision: 1,
    sentAt: AT,
    title: "Mic clips",
    topic: "Studio",
    format: "short",
    keywords: [],
    questions: 1,
    answers: [
      {
        question: "what",
        note,
        typed: null,
        heard: null,
        setAside: false,
        ...more,
      },
      {
        question: "spark",
        note: null,
        typed: "the bus home",
        heard: null,
        setAside: false,
      },
    ],
    furnishing: false,
    setAside: false,
  }
}

function take(
  id: string,
  answers: string,
  recordedAt: string,
  more: Partial<PatternTake> = {}
): PatternTake {
  return {
    id,
    answers,
    durationMs: 2_000,
    recordedAt,
    standing: "current",
    kept: { place: "phone" },
    waits: true,
    ...more,
  }
}

describe("saying an answer again, as data (#2579)", () => {
  it("offers only a said answer of an idea sent whole", () => {
    expect(sayable(SENT)).toEqual(["what"])
    const { sent: _sent, ...caught } = SENT
    expect(sayable(caught)).toEqual([])
  })

  it("sends it again by growing the idea: a take after its takes, a send after its sends", () => {
    const resent = sendAgain(
      SENT,
      [{ question: "what", take: "r1", at: LATER }],
      LATER
    )
    expect(resent?.idea.answers[0]?.takes).toEqual([
      { at: AT, take: "t0" },
      { at: LATER, take: "r1" },
    ])
    expect(resent?.idea.sent).toEqual([AT, LATER])
    expect(resent?.idea.answers[1]).toBe(SENT.answers[1])
    expect(resent?.release).toEqual(["r1"])
    expect(resent?.replaced).toEqual(["t0"])
    expect(grows([SENT], [resent!.idea])).toBe(true)
  })

  it("dates the send after the last even on a clock set back, and sends nothing new twice", () => {
    const back = sendAgain(
      SENT,
      [{ question: "what", take: "r1", at: AT }],
      "2026-10-01T00:00:00.000Z"
    )
    expect(back?.idea.sent).toEqual([AT, "2026-11-01T09:00:00.001Z"])
    expect(
      sendAgain(back!.idea, [{ question: "what", take: "r1", at: AT }], LATER)
    ).toBeNull()
    // A typed answer is not one home names a take for.
    expect(
      sendAgain(SENT, [{ question: "spark", take: "r2", at: LATER }], LATER)
    ).toBeNull()
  })

  it("waits one take per answer: a newer waiting take overtakes the older, and a sent one is never touched", () => {
    const takes = [
      take("r1", LINE, "2026-11-08T09:00:00.000Z", { standing: "earlier" }),
      take("r2", LINE, "2026-11-08T09:05:00.000Z"),
      take("s1", answersOf("idea-1", "spark"), "2026-11-08T09:01:00.000Z"),
      take("gone", LINE, "2026-11-08T09:10:00.000Z", {
        waits: undefined,
        kept: { place: "going" },
      }),
      take("odd", "scene:1", "2026-11-08T09:00:00.000Z"),
    ]
    expect(overtaken(takes)).toEqual(["r1"])
    expect(waitingRedos(takes, "idea-1")).toEqual([
      { question: "what", take: "r2", at: "2026-11-08T09:05:00.000Z" },
      { question: "spark", take: "s1", at: "2026-11-08T09:01:00.000Z" },
    ])
  })

  it("finishes a send cut short: a waiting take the idea names goes, the take before it is set aside", () => {
    const resent = sendAgain(
      SENT,
      [{ question: "what", take: "r1", at: LATER }],
      LATER
    )!.idea
    expect(cutShort([resent], [take("r1", LINE, LATER)])).toEqual({
      release: ["r1"],
      replaced: ["t0"],
    })
    expect(cutShort([SENT], [take("r1", LINE, LATER)])).toEqual({
      release: [],
      replaced: [],
    })
  })

  it("hears home's words for the new take, once, beside the first take's", () => {
    const heard = {
      ...SENT,
      answers: [
        {
          ...SENT.answers[0]!,
          versions: [
            {
              at: "2026-11-01T09:05:00.000Z",
              how: "heard" as const,
              words: "first",
            },
          ],
        },
        SENT.answers[1]!,
      ],
    }
    const resent = sendAgain(
      heard,
      [{ question: "what", take: "r1", at: LATER }],
      LATER
    )!.idea
    const home = onHome("r1", {
      heard: { text: "second", heardAt: "2026-11-08T10:02:00.000Z" },
    })
    const next = withHomeWords([resent], [home])
    expect(next?.[0]?.answers[0]?.versions.map((v) => v.words)).toEqual([
      "first",
      "second",
    ])
    expect(withHomeWords(next!, [home])).toBeNull()
  })

  it("hears the new take's words even when home heard the first take after it was said", () => {
    const late = {
      ...SENT,
      answers: [
        {
          ...SENT.answers[0]!,
          // Home heard the first take only after the new one was said.
          versions: [
            {
              at: "2026-11-08T11:00:00.000Z",
              how: "heard" as const,
              words: "first",
            },
          ],
        },
        SENT.answers[1]!,
      ],
    }
    const resent = sendAgain(
      late,
      [{ question: "what", take: "r1", at: LATER }],
      LATER
    )!.idea
    const home = onHome("r1", {
      heard: { text: "second", heardAt: "2026-11-08T11:05:00.000Z" },
    })
    expect(
      withHomeWords([resent], [home])?.[0]?.answers[0]?.versions.map(
        (v) => v.words
      )
    ).toEqual(["first", "second"])
    // Words fixed since the new take still stand.
    const fixed = {
      ...resent,
      answers: [
        {
          ...resent.answers[0]!,
          versions: [
            ...resent.answers[0]!.versions,
            {
              at: "2026-11-08T10:30:00.000Z",
              how: "fixed" as const,
              words: "mine",
            },
          ],
        },
        resent.answers[1]!,
      ],
    }
    expect(withHomeWords([fixed], [home])).toBeNull()
  })
})

/** Steps `events` in order from `state`, keeping every effect. */
function steps(
  state: OnHomeState,
  events: ReadonlyArray<OnHomeEvent>
): { state: OnHomeState; effects: Array<unknown> } {
  return events.reduce<{ state: OnHomeState; effects: Array<unknown> }>(
    (acc, event) => {
      const next = stepOnHome(acc.state, event)
      return { state: next.state, effects: [...acc.effects, ...next.effects] }
    },
    { state, effects: [] }
  )
}

/** The ideas on this phone read, naming only the idea's first take. */
const READ_PHONE: OnHomeEvent = {
  type: "phoneRead",
  phone: {
    sayable: { "idea-1": ["what"] },
    named: ["t0"],
    latest: { "idea-1": { what: "t0" } },
  },
}

const opened: ReadonlyArray<OnHomeEvent> = [
  READ_PHONE,
  { type: "entered", lists: false },
  {
    type: "ideasRead",
    seq: 1,
    read: { kind: "read", value: { ideas: [onHome()], more: false } },
  },
  { type: "open", id: "idea-1" },
]

describe("the Ideas on home machine, saying an answer again (#2579)", () => {
  it("asks once to delete a waiting take a newer one overtook", () => {
    const listed = [
      take("r1", LINE, "2026-11-08T09:00:00.000Z", { standing: "earlier" }),
      take("r2", LINE, "2026-11-08T09:05:00.000Z"),
    ]
    const { state, effects } = steps(INITIAL_ON_HOME, [
      READ_PHONE,
      { type: "redoTakes", takes: listed },
      { type: "redoTakes", takes: listed },
    ])
    expect(effects).toEqual([{ type: "dropRedos", takes: ["r1"] }])
    expect(state.redo.dropping).toEqual(["r1"])
    // Gone from the listing, it is no longer held as asked.
    expect(
      steps(state, [{ type: "redoTakes", takes: [listed[1]!] }]).state.redo
        .dropping
    ).toEqual([])
  })

  it("sends again only with a take waiting, one write at a time, and says how it went", () => {
    const open = steps(INITIAL_ON_HOME, opened)
    expect(steps(open.state, [{ type: "sendAgain" }]).effects).toEqual([])
    const waiting = steps(open.state, [
      { type: "redoTakes", takes: [take("r1", LINE, LATER)] },
    ]).state
    expect(openRedos(waiting)).toHaveLength(1)
    const sending = steps(waiting, [
      { type: "sendAgain" },
      { type: "sendAgain" },
    ])
    expect(sending.effects).toEqual([
      { type: "sendAgain", id: "idea-1", deleted: [] },
    ])
    expect(sending.state.writing).toBe(true)
    for (const [outcome, notice] of [
      ["sent", "sentAgain"],
      ["partly", "sentAgainPartly"],
      ["unkept", "notSentAgain"],
    ] as const) {
      const done = steps(sending.state, [{ type: "sentAgain", outcome }]).state
      expect(done.writing).toBe(false)
      expect(done.notice).toBe(notice)
    }
  })

  it("finishes a send cut short after each read, never setting aside a note home deleted", () => {
    const { effects } = steps(INITIAL_ON_HOME, [
      { type: "entered", lists: false },
      {
        type: "ideasRead",
        seq: 1,
        read: {
          kind: "read",
          value: {
            ideas: [onHome("t0", { deletedAt: AT })],
            more: false,
          },
        },
      },
    ])
    expect(effects).toContainEqual({ type: "settleRedos", deleted: ["t0"] })
  })
})

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const pass = async (ms = 0): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms)
}

type Phone = {
  readonly runtime: OnHomeRuntime
  readonly simulated: SimulatedPattern
  readonly ideas: IdeaStore
  readonly setAside: Mock<(ids: ReadonlyArray<string>, at: string) => boolean>
  readonly attach: () => () => void
}

/** Ideas on home over `home`'s ideas, the phone keeping `kept`. */
function phone(
  options: {
    readonly home?: ReadonlyArray<HomeIdea>
    readonly kept?: ReadonlyArray<Idea>
    readonly ideas?: (kept: IdeaStore) => IdeaStore
    readonly seed?: ReadonlyArray<PatternTake>
    /** Takes whose release the desk refuses. */
    readonly unreleasable?: ReadonlyArray<string>
  } = {}
): Phone {
  const storage = inMemoryStorage()
  const store = keptIdeaStore(() => storage)
  store.keep(() => options.kept ?? [SENT])
  const ideas = options.ideas?.(store) ?? store
  const simulated = simulatedPattern({
    options: { ...ONE_TAKE, send: "on-confirm" },
    seed: options.seed,
  })
  const setAside = vi.fn((_ids: ReadonlyArray<string>, _at: string) => true)
  const home: IdeasHome = {
    ideas: () =>
      Promise.resolve({
        kind: "read",
        value: { ideas: options.home ?? [onHome()], more: false },
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
  const runtime = createIdeasOnHome({
    home,
    ideas,
    lists: keptIdeaLists(() => storage),
    redo: {
      takes: {
        ...bundleTakesOf(simulated),
        release: (ids): boolean =>
          ids.some((id) => options.unreleasable?.includes(id) === true)
            ? false
            : simulated.store.release(ids),
      },
      setAside,
    },
    now: Date.now,
  })
  return {
    runtime,
    simulated,
    ideas,
    setAside,
    attach: (): (() => void) => {
      const detach = runtime.attach(false)
      runtime.dispatch({ type: "open", id: "idea-1" })
      return detach
    },
  }
}

/** Says the first answer again: a tap, talk, a tap. */
async function sayAgain(
  on: Phone,
  supersedes: string | null = null
): Promise<void> {
  on.simulated.pattern.tap(LINE, supersedes)
  await pass(2_000)
  on.simulated.pattern.tap(LINE, supersedes)
  await pass()
}

const takesOf = (on: Phone): ReadonlyArray<PatternTake> =>
  on.simulated.store.getSnapshot()

const firstTakes = (on: Phone): ReadonlyArray<string> =>
  on.ideas.list()?.[0]?.answers[0]?.takes?.map((each) => each.take) ?? []

describe("an answer said again, end to end on the simulated microphone (#2579)", () => {
  it("waits on the phone through leaving the screen, and goes only when the idea is sent again", async () => {
    const on = phone()
    let detach = on.attach()
    await pass()
    expect(on.runtime.getSnapshot().redo.phone?.sayable).toEqual({
      "idea-1": ["what"],
    })
    await sayAgain(on)
    detach()
    // Nothing moved: the idea is as it was sent, and the take waits.
    expect(on.ideas.list()).toEqual([SENT])
    expect(takesOf(on).map((each) => each.waits)).toEqual([true])
    expect(on.setAside).not.toHaveBeenCalled()

    detach = on.attach()
    await pass()
    const [redo] = takesOf(on)
    expect(openRedos(on.runtime.getSnapshot())).toHaveLength(1)
    on.runtime.dispatch({ type: "sendAgain" })
    expect(on.runtime.getSnapshot().notice).toBe("sentAgain")
    expect(firstTakes(on)).toEqual(["t0", redo!.id])
    expect(on.ideas.list()?.[0]?.sent).toHaveLength(2)
    expect(on.setAside).toHaveBeenCalledWith(["t0"], expect.any(String))
    expect(takesOf(on)[0]?.waits).toBeUndefined()
    expect(openRedos(on.runtime.getSnapshot())).toEqual([])
    detach()
  })

  it("keeps one waiting take an answer: said twice, the first is deleted, and only the second goes", async () => {
    const on = phone()
    const detach = on.attach()
    await pass()
    await sayAgain(on)
    const [first] = takesOf(on)
    await sayAgain(on, first!.id)
    expect(takesOf(on).map((each) => each.id)).not.toContain(first!.id)
    on.runtime.dispatch({ type: "sendAgain" })
    expect(firstTakes(on)).toHaveLength(2)
    expect(firstTakes(on)).not.toContain(first!.id)
    detach()
  })

  it("said again after a send again, sets aside the take the last send named", async () => {
    const on = phone()
    const detach = on.attach()
    await pass()
    await sayAgain(on)
    on.runtime.dispatch({ type: "sendAgain" })
    on.runtime.dispatch({ type: "noticeDismissed" })
    const [r1] = firstTakes(on).slice(1)
    await sayAgain(on)
    on.runtime.dispatch({ type: "sendAgain" })
    expect(firstTakes(on)).toHaveLength(3)
    expect(on.ideas.list()?.[0]?.sent).toHaveLength(3)
    expect(on.setAside).toHaveBeenLastCalledWith([r1], expect.any(String))
    detach()
  })

  it("changes nothing when the phone can't keep the idea: the take still waits", async () => {
    const on = phone({
      ideas: (kept): IdeaStore => ({ list: kept.list, keep: () => null }),
    })
    const detach = on.attach()
    await pass()
    await sayAgain(on)
    on.runtime.dispatch({ type: "sendAgain" })
    expect(on.runtime.getSnapshot().notice).toBe("notSentAgain")
    expect(on.setAside).not.toHaveBeenCalled()
    expect(takesOf(on)[0]?.waits).toBe(true)
    detach()
  })

  it("says so when the replaced take couldn't be set aside, and the next read finishes it", async () => {
    const on = phone()
    const detach = on.attach()
    await pass()
    await sayAgain(on)
    on.setAside.mockReturnValueOnce(false)
    on.runtime.dispatch({ type: "sendAgain" })
    expect(on.runtime.getSnapshot().notice).toBe("sentAgainPartly")
    // Kept, but its new take still waits: the send was cut short.
    expect(firstTakes(on)).toHaveLength(2)
    expect(takesOf(on)[0]?.waits).toBe(true)
    detach()

    on.attach()
    await pass()
    expect(on.setAside).toHaveBeenLastCalledWith(["t0"], expect.any(String))
    expect(takesOf(on)[0]?.waits).toBeUndefined()
  })

  it("never deletes a take the idea kept names, still waiting after a send cut short, when the answer is said again (Codex P1 on #2804)", async () => {
    const on = phone()
    const detach = on.attach()
    await pass()
    await sayAgain(on)
    const [kept] = takesOf(on)
    on.setAside.mockReturnValueOnce(false)
    on.runtime.dispatch({ type: "sendAgain" })
    expect(firstTakes(on)).toEqual(["t0", kept!.id])
    // It is the idea's record now, not a draft: nothing offers to send or
    // delete it as one.
    expect(openRedos(on.runtime.getSnapshot())).toEqual([])
    on.runtime.dispatch({ type: "noticeDismissed" })
    // Even a take said again that supersedes it, as a Redo on its row would.
    await sayAgain(on, kept!.id)
    expect(takesOf(on).map((each) => each.id)).toContain(kept!.id)
    detach()

    // The next read finishes the cut-short send, and the new take still
    // waits to be sent on its own.
    const again = on.attach()
    await pass()
    expect(takesOf(on).find((each) => each.id === kept!.id)?.waits).toBe(
      undefined
    )
    expect(openRedos(on.runtime.getSnapshot())).toHaveLength(1)
    again()
  })

  it("finishes this idea's cut-short send before sending again: the waiting take goes, then the one it replaced is set aside", async () => {
    const on = phone()
    const detach = on.attach()
    await pass()
    await sayAgain(on)
    const [r1] = takesOf(on)
    on.setAside.mockReturnValueOnce(false)
    on.runtime.dispatch({ type: "sendAgain" })
    on.runtime.dispatch({ type: "noticeDismissed" })
    await sayAgain(on)
    on.runtime.dispatch({ type: "sendAgain" })
    expect(on.runtime.getSnapshot().notice).toBe("sentAgain")
    expect(on.setAside.mock.calls.map(([ids]) => ids)).toEqual([
      ["t0"],
      ["t0"],
      [r1!.id],
    ])
    expect(takesOf(on).map((each) => each.waits)).toEqual([
      undefined,
      undefined,
    ])
    expect(firstTakes(on)).toHaveLength(3)
    detach()
  })

  it("is neither blocked nor marked by another idea's cut-short send, nor sets aside a note home deleted there (review of #2804)", async () => {
    const lineB = answersOf("idea-2", "what")
    const B: Idea = {
      ...SENT,
      id: "idea-2",
      answers: [
        {
          question: "what",
          versions: [],
          takes: [
            { at: AT, take: "b0" },
            { at: LATER, take: "kb" },
          ],
        },
      ],
      sent: [AT, LATER],
    }
    const homeB: HomeIdea = {
      ...onHome("b0", { deletedAt: AT }),
      id: "idea-2",
      title: "B",
    }
    const on = phone({
      kept: [SENT, B],
      home: [onHome(), homeB],
      seed: [take("kb", lineB, LATER)],
      unreleasable: ["kb"],
    })
    const detach = on.attach()
    await pass()
    await sayAgain(on)
    on.runtime.dispatch({ type: "sendAgain" })
    expect(on.runtime.getSnapshot().notice).toBe("sentAgain")
    expect(on.setAside.mock.calls.flatMap(([ids]) => ids)).not.toContain("b0")
    expect(firstTakes(on)).toHaveLength(2)
    detach()
  })

  it("says nothing was kept when this idea's own cut-short send still can't finish", async () => {
    const on = phone({ unreleasable: ["take-1"] })
    const detach = on.attach()
    await pass()
    await sayAgain(on)
    on.runtime.dispatch({ type: "sendAgain" })
    expect(on.runtime.getSnapshot().notice).toBe("sentAgainPartly")
    on.runtime.dispatch({ type: "noticeDismissed" })
    await sayAgain(on)
    on.runtime.dispatch({ type: "sendAgain" })
    expect(on.runtime.getSnapshot().notice).toBe("notSentAgain")
    expect(firstTakes(on)).toHaveLength(2)
    expect(takesOf(on).find((each) => each.id === "take-2")?.waits).toBe(true)
    detach()
  })

  it("names every deleted note home's read shows when it sends again, not only the open idea's", () => {
    const other: HomeIdea = {
      ...onHome("b0", { deletedAt: AT }),
      id: "idea-2",
    }
    const { effects } = steps(INITIAL_ON_HOME, [
      READ_PHONE,
      { type: "entered", lists: false },
      {
        type: "ideasRead",
        seq: 1,
        read: {
          kind: "read",
          value: { ideas: [onHome(), other], more: false },
        },
      },
      { type: "open", id: "idea-1" },
      { type: "redoTakes", takes: [take("r1", LINE, LATER)] },
      { type: "sendAgain" },
    ])
    expect(effects).toContainEqual({
      type: "sendAgain",
      id: "idea-1",
      deleted: ["b0"],
    })
  })

  it("deletes nothing before the ideas on this phone are read", () => {
    const committed = take("r1", LINE, "2026-11-08T09:00:00.000Z")
    const draft = take("r2", LINE, "2026-11-08T09:05:00.000Z")
    const { effects } = steps(INITIAL_ON_HOME, [
      { type: "redoTakes", takes: [committed, draft] },
    ])
    expect(effects).toEqual([])
    const named = steps(INITIAL_ON_HOME, [
      { type: "redoTakes", takes: [committed, draft] },
      {
        type: "phoneRead",
        phone: { sayable: {}, named: ["r1"], latest: {} },
      },
    ])
    expect(named.effects).toEqual([])
  })

  it("shows the answer sent again until home names it (Codex P2 on #2804)", async () => {
    const on = phone()
    const detach = on.attach()
    await pass()
    expect(sentAgainTake(on.runtime.getSnapshot(), "idea-1", "what")).toBe(null)
    await sayAgain(on)
    const [redo] = takesOf(on)
    on.runtime.dispatch({ type: "sendAgain" })
    expect(sentAgainTake(on.runtime.getSnapshot(), "idea-1", "what")).toBe(
      redo!.id
    )
    detach()
    // Home names it once the idea reaches it: home's answer stands again.
    const home = phone({ home: [onHome(redo!.id)], kept: on.ideas.list()! })
    home.attach()
    await pass()
    expect(sentAgainTake(home.runtime.getSnapshot(), "idea-1", "what")).toBe(
      null
    )
  })

  it("never sets aside a take home deleted for good", async () => {
    const on = phone({ home: [onHome("t0", { deletedAt: AT })] })
    const detach = on.attach()
    await pass()
    await sayAgain(on)
    on.runtime.dispatch({ type: "sendAgain" })
    expect(on.runtime.getSnapshot().notice).toBe("sentAgain")
    expect(on.setAside).not.toHaveBeenCalled()
    expect(takesOf(on)[0]?.waits).toBeUndefined()
    detach()
  })

  it("leaves nothing to send once the waiting take is deleted", async () => {
    const on = phone()
    const detach = on.attach()
    await pass()
    await sayAgain(on)
    const [redo] = takesOf(on)
    on.simulated.pattern.letGo(redo!.id, "phone")
    await pass()
    expect(takesOf(on)).toEqual([])
    expect(openRedos(on.runtime.getSnapshot())).toEqual([])
    on.runtime.dispatch({ type: "sendAgain" })
    expect(on.ideas.list()).toEqual([SENT])
    detach()
  })
})

describe("a new idea's screen never reaches an answer said again (#2579)", () => {
  it("drops a kept idea's unnamed waiting take on its own desk, and leaves the desk of answers said again alone", async () => {
    const storage = inMemoryStorage()
    const ideas = keptIdeaStore(() => storage)
    ideas.keep(() => [SENT])
    const waiting = take("r1", LINE, LATER)
    const options = { ...ONE_TAKE, send: "on-confirm" as const }
    // The same take on the new idea's desk is the bundle's to drop…
    const bundleDesk = simulatedPattern({ options, seed: [waiting] })
    const redoDesk = simulatedPattern({ options, seed: [waiting] })
    const discard = vi.fn(bundleDesk.store.discard)
    const bundle = createIdeaBundle({
      takes: { ...bundleTakesOf(bundleDesk), discard },
      drafts: keptDraftStore(() => storage),
      ideas,
      lists: () => IDEA_LISTS_SEED,
      home: { reach: () => "near", subscribe: () => (): void => undefined },
      now: Date.now,
      newId: (): string => "idea-2",
      onVisibility: (listener) => {
        listener(false)
        return (): void => undefined
      },
    })
    const detach = bundle.attach()
    await pass()
    expect(discard).toHaveBeenCalledWith(["r1"])
    // …while on the desk of answers said again, nothing the bundle runs
    // can reach it.
    expect(redoDesk.store.getSnapshot()).toEqual([waiting])
    detach()
  })
})
