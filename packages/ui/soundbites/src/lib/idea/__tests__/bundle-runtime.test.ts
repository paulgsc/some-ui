/**
 * @vitest-environment jsdom
 *
 * A new idea's runtime (ST26) over the real take pattern on the shared
 * simulated microphone, with `send: "on-confirm"`, its takes in memory, and
 * the real draft and idea stores in a page's storage: nothing leaves the
 * phone before Send, Send keeps the idea whole and only then lets its takes
 * go, and a delete before Send is gone for good.
 */
import { inMemoryStorage } from "@some-ui/core-utils"
import { ONE_TAKE } from "@some-ui/voice-capture"
import type { SimulatedPattern } from "@some-ui/voice-capture/testing"
import { simulatedPattern, SPEAKING } from "@some-ui/voice-capture/testing"
import { bundleTakesOf } from "@soundbites/fixtures"
import type { BundleRuntime } from "@soundbites/lib/idea/bundle-runtime"
import { createIdeaBundle } from "@soundbites/lib/idea/bundle-runtime"
import type { DraftStore } from "@soundbites/lib/idea/draft"
import { IDEA_LISTS_SEED, keptDraftStore } from "@soundbites/lib/idea/draft"
import type { Idea } from "@soundbites/lib/idea/model"
import type { IdeaStore } from "@soundbites/lib/idea/store"
import { keptIdeaStore } from "@soundbites/lib/idea/store"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
  readonly bundle: BundleRuntime
  readonly simulated: SimulatedPattern
  readonly drafts: DraftStore
  readonly ideas: IdeaStore
  readonly release: ReturnType<typeof vi.fn>
}

let ids = 0

function phone(
  storage = inMemoryStorage(),
  simulated = simulatedPattern({
    options: { ...ONE_TAKE, send: "on-confirm" },
  }),
  draftsOf: (kept: DraftStore) => DraftStore = (kept) => kept
): Phone {
  const drafts = draftsOf(keptDraftStore(() => storage))
  const ideas = keptIdeaStore(() => storage)
  const takes = bundleTakesOf(simulated)
  const release = vi.fn(takes.release)
  const bundle = createIdeaBundle({
    takes: { ...takes, release },
    drafts,
    ideas,
    lists: () => IDEA_LISTS_SEED,
    home: { reach: () => "near", subscribe: () => (): void => undefined },
    now: Date.now,
    newId: (): string => `idea-${(ids += 1)}`,
  })
  bundle.attach()
  return { bundle, simulated, drafts, ideas, release }
}

/** Says the answer on the card at `question`: a tap, talk, a tap. */
async function say(
  on: Phone,
  question: "what" | "takeaway" | "spark" | "picture"
): Promise<void> {
  on.bundle.dispatch({ type: "tap", question })
  await pass(2_000)
  on.bundle.dispatch({ type: "tap", question })
  await pass()
}

function titled(on: Phone): void {
  on.bundle.dispatch({ type: "title", text: "Two hearings, one word" })
  on.bundle.dispatch({ type: "start" })
}

describe("a new idea, end to end on the simulated microphone (ST26)", () => {
  it("keeps every take on the phone, waiting, until Send; then the idea first and its takes after", async () => {
    const on = phone()
    titled(on)
    await say(on, "what")
    await say(on, "spark")
    const takes = on.simulated.store.getSnapshot()
    expect(takes.map((take) => take.kept)).toEqual([
      { place: "phone" },
      { place: "phone" },
    ])
    expect(on.release).not.toHaveBeenCalled()
    expect(on.ideas.list()).toEqual([])
    const id = on.bundle.getSnapshot().draft.id
    expect(on.drafts.read()?.id).toBe(id)

    on.bundle.dispatch({ type: "review" })
    on.bundle.dispatch({ type: "send" })

    const [sent] = on.ideas.list() ?? []
    expect(sent).toMatchObject({
      id,
      about: { title: "Two hearings, one word", format: "short" },
      answers: [
        { question: "what", takes: [{ take: takes[0]?.id }] },
        { question: "spark", takes: [{ take: takes[1]?.id }] },
      ],
      passed: ["takeaway", "picture"],
    })
    expect(on.release).toHaveBeenCalledWith(takes.map((take) => take.id))
    expect(
      on.simulated.store.getSnapshot().map((take) => take.kept?.place)
    ).toEqual(["going", "going"])
    expect(on.drafts.read()).toBeNull()
    expect(on.bundle.getSnapshot().screen).toBe("sent")
  })

  it("resumes the same idea after the screen goes, with its takes", async () => {
    const storage = inMemoryStorage()
    const simulated = simulatedPattern({
      options: { ...ONE_TAKE, send: "on-confirm" },
    })
    const first = phone(storage, simulated)
    titled(first)
    await say(first, "what")
    const again = phone(storage, simulated)
    const state = again.bundle.getSnapshot()
    expect(state.screen).toBe("questions")
    expect(state.draft.id).toBe(first.bundle.getSnapshot().draft.id)
    expect(state.takes).toHaveLength(1)
  })

  it("says voice didn't come through when the microphone refuses, and takes typed words then", async () => {
    const on = phone()
    titled(on)
    on.simulated.mic.script({
      ...SPEAKING,
      open: { kind: "refuse", reason: "denied", ms: 10 },
    })
    on.bundle.dispatch({ type: "tap", question: "what" })
    await pass(50)
    expect(on.bundle.getSnapshot().modes.what).toEqual({
      kind: "failed",
      full: false,
    })
    on.bundle.dispatch({ type: "typeInstead", question: "what" })
    on.bundle.dispatch({
      type: "typed",
      question: "what",
      text: "Two hearings",
    })
    on.bundle.dispatch({ type: "keepTyped", question: "what" })
    expect(on.drafts.read()?.typed).toEqual({ what: "Two hearings" })
    // Say it instead: the take kept takes the typed words' place.
    await say(on, "what")
    expect(on.drafts.read()?.typed).toEqual({})
    expect(on.simulated.store.getSnapshot()).toHaveLength(1)
  })

  it("deletes one answer for good once asked, and nothing was sent", async () => {
    const on = phone()
    titled(on)
    await say(on, "what")
    on.bundle.dispatch({ type: "askDelete", question: "what" })
    expect(on.simulated.store.getSnapshot()).toHaveLength(1)
    on.bundle.dispatch({ type: "confirmed" })
    expect(on.simulated.store.getSnapshot()).toEqual([])
    expect(on.bundle.getSnapshot().notice).toBe("deleted")
    expect(on.release).not.toHaveBeenCalled()
  })

  it("says an answer again: the take it replaced is deleted for good, so one take per answer waits", async () => {
    const on = phone()
    titled(on)
    await say(on, "what")
    const [first] = on.simulated.store.getSnapshot()
    await say(on, "what")
    await say(on, "what")
    const left = on.simulated.store.getSnapshot()
    expect(left).toHaveLength(1)
    expect(left[0]?.id).not.toBe(first?.id)
    expect(on.release).not.toHaveBeenCalled()
  })

  it("sends nothing of an answer said again and then deleted, and only the takes the idea names", async () => {
    const on = phone()
    titled(on)
    await say(on, "what")
    const [what] = on.simulated.store.getSnapshot()
    await say(on, "spark")
    await say(on, "spark")
    on.bundle.dispatch({ type: "askDelete", question: "spark" })
    on.bundle.dispatch({ type: "confirmed" })
    expect(on.simulated.store.getSnapshot().map((take) => take.id)).toEqual([
      what?.id,
    ])
    on.bundle.dispatch({ type: "review" })
    on.bundle.dispatch({ type: "send" })
    expect(on.release).toHaveBeenCalledTimes(1)
    expect(on.release).toHaveBeenCalledWith([what?.id])
    expect(on.ideas.list()?.[0]?.answers.map((each) => each.question)).toEqual([
      "what",
    ])
  })

  it("starts no take when the draft it would answer couldn't be kept", async () => {
    const on = phone(inMemoryStorage(), undefined, (kept) => ({
      ...kept,
      write: (): boolean => false,
    }))
    titled(on)
    on.bundle.dispatch({ type: "tap", question: "what" })
    await pass(2_000)
    expect(on.simulated.pattern.getSnapshot().take.kind).toBe("idle")
    expect(on.simulated.store.getSnapshot()).toEqual([])
    expect(on.bundle.getSnapshot().notice).toBe("notKept")
  })

  it("deletes the whole idea, title and every take, for good", async () => {
    const on = phone()
    titled(on)
    await say(on, "what")
    await say(on, "what")
    on.bundle.dispatch({ type: "review" })
    on.bundle.dispatch({ type: "askDeleteAll" })
    on.bundle.dispatch({ type: "confirmed" })
    expect(on.simulated.store.getSnapshot()).toEqual([])
    expect(on.drafts.read()).toBeNull()
    expect(on.bundle.getSnapshot()).toMatchObject({
      screen: "about",
      notice: "deletedAll",
      draft: { about: { title: "" } },
    })
  })

  it("after a Send cut short, lets go on opening only the takes the kept idea names, and deletes the rest", async () => {
    const storage = inMemoryStorage()
    const simulated = simulatedPattern({
      options: { ...ONE_TAKE, send: "on-confirm" },
    })
    const first = phone(storage, simulated)
    titled(first)
    await say(first, "what")
    const [taken] = simulated.store.getSnapshot()
    // Said, but not in the idea the Send kept.
    await say(first, "spark")
    const idea: Idea = {
      id: first.bundle.getSnapshot().draft.id,
      at: new Date(0).toISOString(),
      questions: 1,
      answers: [
        {
          question: "what",
          versions: [],
          takes: [{ at: taken?.recordedAt ?? "", take: taken?.id ?? "" }],
        },
      ],
      passed: [],
    }
    first.ideas.keep((ideas) => [...ideas, idea])
    const again = phone(storage, simulated)
    expect(again.release).toHaveBeenCalledTimes(1)
    expect(again.release).toHaveBeenCalledWith([taken?.id])
    expect(simulated.store.getSnapshot().map((take) => take.id)).toEqual([
      taken?.id,
    ])
    expect(again.drafts.read()).toBeNull()
    expect(again.bundle.getSnapshot().screen).toBe("about")
  })
})
