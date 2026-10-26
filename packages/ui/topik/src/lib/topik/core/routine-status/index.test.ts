import type {
  HeldRuns,
  RoutineRun,
} from "@topik/lib/topik/adapter/routine-runs"
import type {
  RoutineShape,
  RoutineView,
} from "@topik/lib/topik/core/routine-status"
import {
  ROUTINE_WORDS,
  routineView,
  runLine,
} from "@topik/lib/topik/core/routine-status"
import { MACHINERY } from "@topik/lib/topik/read-aloud/__tests__/machinery"
import { describe, expect, it } from "vitest"

// Noon UTC keeps every timezone on the same local day.
const TODAY = "2026-10-24"
const RAN = "2026-10-24T12:00:00.000Z"
const NOW = new Date("2026-10-24T13:00:00.000Z")
const SCENE = {
  folder: "scene",
  name: "scene-a.json",
  title: "TOPIK 2 · 로맨스 · 첫 만남",
} as const
const DRAMA = { folder: "drama", name: "drama-b.json", title: "숨" } as const

const run = (over: Partial<RoutineRun> = {}): RoutineRun => ({
  name: "run-reflections-20261024T120000Z.json",
  startedAt: RAN,
  finishedAt: RAN,
  outcome: "done",
  found: { reflections: 1, prompts: 1 },
  added: [SCENE, DRAMA],
  problems: [],
  voice: null,
  nextBy: null,
  ...over,
})
const held = (runs: Array<RoutineRun>, lookedAt = RAN): HeldRuns => ({
  runs,
  lookedAt,
  since: lookedAt,
})
const shapeOf = (
  runs: HeldRuns,
  opened: ReadonlySet<string> = new Set(),
  now = NOW
): RoutineShape => routineView(runs, opened, now, TODAY).shape

describe("what the routine's mark says", () => {
  it("is fresh while something it left is not opened, and says what", () => {
    const view = routineView(
      held([run()]),
      new Set(["scene/scene-a.json"]),
      NOW,
      TODAY
    )
    expect(view.shape).toBe("fresh")
    expect(view.word).toBe("1 new")
    expect(view.line).toContain(
      "New from the routine: a drama, not opened yet."
    )
    // An earlier run's file, still not opened, counts too.
    expect(
      routineView(
        held([
          run({ added: [] }),
          run({ name: "older", added: [SCENE, SCENE] }),
        ]),
        new Set(),
        NOW,
        TODAY
      ).word
    ).toBe("2 new")
  })

  it("is opened once all it left is, and rested when it had nothing to answer", () => {
    expect(
      shapeOf(
        held([run()]),
        new Set(["scene/scene-a.json", "drama/drama-b.json"])
      )
    ).toBe("opened")
    const rested = routineView(
      held([run({ added: [], found: { reflections: 0, prompts: 0 } })]),
      new Set(),
      NOW,
      TODAY
    )
    expect(rested.shape).toBe("rested")
    expect(rested.line).toContain("there were none since its last run")
  })

  it("tells a run that ended early from one that left some, each with the routine's own sentence", () => {
    const stopped = routineView(
      held([run({ outcome: "stopped", problems: ["Drive wasn't there."] })]),
      new Set(),
      NOW,
      TODAY
    )
    expect(stopped.shape).toBe("stopped")
    expect(stopped.line).toMatch(/ended early: Drive wasn't there\.$/)
    const partly = routineView(
      held([run({ outcome: "partly", problems: ["A drama wouldn't play."] })]),
      new Set(),
      NOW,
      TODAY
    )
    expect(partly.shape).toBe("partly")
    expect(partly.line).toMatch(
      /left some of what it found: A drama wouldn't play\.$/
    )
  })

  it("says each voice-note state on its own, beside whatever the run did", () => {
    const view = (
      voice: RoutineRun["voice"],
      outcome: RoutineRun["outcome"] = "done"
    ): RoutineView =>
      routineView(held([run({ voice, outcome })]), new Set(), NOW, TODAY)
    // A run from before it said: nothing either way.
    expect(view(null).voice).toEqual([])
    expect(view({ waiting: 0, missed: 0, unread: false }).voice).toEqual([])
    const all = view({ waiting: 2, missed: 1, unread: true }, "partly")
    expect(all.shape).toBe("partly")
    expect(all.voice.map((v) => v.shape)).toEqual([
      "unread",
      "missed",
      "waiting",
    ])
    expect(all.voice.map((v) => v.line)).toEqual([
      "The routine couldn't read what home heard in your voice notes, so they wait for its next run.",
      "One thing you shared was answered without a voice note home never heard. Voice notes reach home only while this phone keeps them there.",
      "2 things you shared wait for home to hear a voice note.",
    ])
    // A note answered without still leaves a done run done, and says so.
    const missed = view({ waiting: 0, missed: 2, unread: false })
    expect(missed.shape).toBe("fresh")
    expect(missed.voice.map((v) => v.shape)).toEqual(["missed"])
    expect(ROUTINE_WORDS.open(missed)).toContain(
      "2 things you shared were answered without"
    )
    // The history row says them too.
    expect(
      runLine(run({ voice: { waiting: 1, missed: 0, unread: false } }), TODAY)
    ).toMatch(/One thing you shared waits for home to hear a voice note\.$/)
  })

  it("is quiet only when home answered after a run was due and told of none", () => {
    const late = new Date("2026-10-25T15:00:00.000Z")
    // Due a day and two hours on: 14:00 the next day.
    expect(
      shapeOf(held([run()], "2026-10-25T14:30:00.000Z"), new Set(), late)
    ).toBe("quiet")
    expect(shapeOf(held([run()], RAN), new Set(), late)).toBe("away")
    // The run's own word for when the next is due wins.
    expect(
      shapeOf(
        held(
          [run({ nextBy: "2026-10-25T17:00:00.000Z" })],
          "2026-10-25T14:30:00.000Z"
        ),
        new Set(),
        late
      )
    ).toBe("fresh")
  })

  it("has heard of nothing before home first tells of a run", () => {
    expect(shapeOf({ runs: [], lookedAt: null, since: null })).toBe("unheard")
    expect(shapeOf(held([]))).toBe("unheard")
  })

  it("says each run as what it found and added", () => {
    expect(runLine(run(), TODAY)).toMatch(
      /^today at .+\. Added a word set and a drama: TOPIK 2 · 로맨스 · 첫 만남; 숨\.$/
    )
    expect(
      runLine(run({ added: [], found: { reflections: 0, prompts: 0 } }), TODAY)
    ).toMatch(/Nothing to answer\.$/)
    expect(
      runLine(
        run({
          added: [],
          found: { reflections: 2, prompts: 0 },
          outcome: "partly",
          problems: ["A voice note couldn't be heard."],
        }),
        TODAY
      )
    ).toMatch(
      /Found 2 reflections, and added nothing\. Some of it couldn't be done\. A voice note couldn't be heard\.$/
    )
  })

  it("never reaches for the machinery's terms", () => {
    const lookedAt = "2026-10-25T14:30:00.000Z"
    const late = new Date("2026-10-25T15:00:00.000Z")
    const views = [
      routineView(held([run()]), new Set(), NOW, TODAY),
      routineView(held([run({ added: [] })]), new Set(), NOW, TODAY),
      routineView(held([run({ outcome: "partly" })]), new Set(), NOW, TODAY),
      routineView(held([run({ outcome: "stopped" })]), new Set(), NOW, TODAY),
      routineView(
        held([run({ voice: { waiting: 1, missed: 2, unread: true } })]),
        new Set(),
        NOW,
        TODAY
      ),
      routineView(held([run()], lookedAt), new Set(), late, TODAY),
      routineView(held([run()]), new Set(), late, TODAY),
      routineView(
        { runs: [], lookedAt: null, since: null },
        new Set(),
        NOW,
        TODAY
      ),
    ]
    const words = [
      ...views.flatMap((view) => [
        view.word,
        view.line,
        ROUTINE_WORDS.open(view),
        ...view.voice.map((v) => v.line),
      ]),
      ...Object.values(ROUTINE_WORDS.shapes),
      ...Object.values(ROUTINE_WORDS.voiceShapes),
      ROUTINE_WORDS.title,
      ROUTINE_WORDS.what,
      ROUTINE_WORDS.history,
      ROUTINE_WORDS.legend,
      ROUTINE_WORDS.done,
      ROUTINE_WORDS.kept(RAN, TODAY),
      runLine(run({ outcome: "stopped" }), TODAY),
    ]
    for (const word of words) {
      expect([word, word.match(MACHINERY)]).toEqual([word, null])
      expect(word).not.toMatch(/\b(mailbox|run record|folder|seq)\b/i)
    }
  })
})
