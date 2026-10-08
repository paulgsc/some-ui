import type {
  DramaEvent,
  DramaState,
  Lesson,
  Route,
  Transition,
} from "@makjang/index"
import { auditStory, resume, scenesOf, start, step } from "@makjang/index"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { rawTree } from "./fixture"

function lesson(): Lesson<unknown> {
  const audit = auditStory(rawTree())
  if (!audit.ok) throw new Error(JSON.stringify(audit.findings))
  return audit.lesson
}

const LESSON = lesson()

const ADVANCE: DramaEvent = { type: "advance" }
const BACK: DramaEvent = { type: "back" }
const RESTART: DramaEvent = { type: "restart" }
const choose = (option: string): DramaEvent => ({ type: "choose", option })

function run(events: Array<DramaEvent>, from = start(LESSON)): Transition {
  return events.reduce<Transition>(
    (current, event) => step(LESSON, current.state, event),
    from
  )
}

/** The events that walk from the opening to the scene `route` leads to. */
function walkTo(route: Route): Array<DramaEvent> {
  const events: Array<DramaEvent> = []
  let state = start(LESSON).state
  for (const option of route) {
    while (state.at.kind !== "choice") {
      events.push(ADVANCE)
      state = step(LESSON, state, ADVANCE).state
    }
    events.push(choose(option))
    state = step(LESSON, state, choose(option)).state
  }
  return events
}

describe("start", () => {
  it("opens on the root's first beat, with nothing chosen", () => {
    expect(start(LESSON)).toEqual({
      state: { route: [], at: { kind: "beat", id: "s-root-n1" }, first: {} },
      effects: [
        {
          type: "enter-scene",
          scene: "s-root",
          place: "place of s-root",
          feeling: "feeling of s-root",
        },
        { type: "voice", beat: "s-root-n1", speaker: null },
      ],
    })
  })
})

describe("step", () => {
  it("advances beat by beat to the scene's choice, and no further", () => {
    const second = run([ADVANCE])
    expect(second.state.at).toEqual({ kind: "beat", id: "s-root-l1" })
    expect(second.effects).toEqual([
      { type: "voice", beat: "s-root-l1", speaker: "p2" },
      { type: "persist", point: second.state },
    ])
    const open = run([ADVANCE, ADVANCE, ADVANCE])
    expect(open.state.at).toEqual({ kind: "choice" })
    expect(step(LESSON, open.state, ADVANCE)).toEqual({
      state: open.state,
      effects: [],
    })
  })

  it("goes back a beat, from the open choice too, and stops at the scene's first beat", () => {
    const open = run([ADVANCE, ADVANCE, ADVANCE])
    expect(step(LESSON, open.state, BACK).state.at).toEqual({
      kind: "beat",
      id: "s-root-l2",
    })
    const first = start(LESSON)
    expect(step(LESSON, first.state, BACK)).toEqual({
      state: first.state,
      effects: [],
    })
  })

  it("never goes back across a choice", () => {
    const entered = run(walkTo(["b"]))
    expect(entered.state.at).toEqual({ kind: "beat", id: "s-b-n1" })
    expect(step(LESSON, entered.state, BACK).effects).toEqual([])
  })

  it("enters the chosen option's scene and records the first choice", () => {
    const chosen = run(walkTo(["b"]))
    expect(chosen.state).toEqual({
      route: ["b"],
      at: { kind: "beat", id: "s-b-n1" },
      first: { "c-root": "b" },
    })
    expect(chosen.effects).toEqual([
      { type: "answered", choice: "c-root", option: "b", first: true },
      {
        type: "enter-scene",
        scene: "s-b",
        place: "place of s-b",
        feeling: "feeling of s-b",
      },
      { type: "voice", beat: "s-b-n1", speaker: null },
      { type: "persist", point: chosen.state },
    ])
  })

  it("ignores a choice while a beat shows, and an option the choice does not have", () => {
    const beat = start(LESSON)
    expect(step(LESSON, beat.state, choose("a")).effects).toEqual([])
    const open = run([ADVANCE, ADVANCE, ADVANCE])
    expect(step(LESSON, open.state, choose("x")).effects).toEqual([])
  })

  it("ends on a leaf, where advancing does nothing and back returns to its last beat", () => {
    const end = run([...walkTo(["a"]), ADVANCE, ADVANCE])
    expect(end.state.at).toEqual({ kind: "end" })
    expect(step(LESSON, end.state, ADVANCE).effects).toEqual([])
    expect(step(LESSON, end.state, BACK).state.at).toEqual({
      kind: "beat",
      id: "s-a-n2",
    })
  })

  it("restarts from the root keeping the first choices, and a replayed choice records nothing new", () => {
    const first = run(walkTo(["b", "x"]))
    const restarted = step(LESSON, first.state, RESTART)
    expect(restarted.state).toEqual({
      route: [],
      at: { kind: "beat", id: "s-root-n1" },
      first: { "c-root": "b", "c-b": "x" },
    })
    const replayed = run(walkTo(["c"]), restarted)
    expect(replayed.state.first).toEqual({ "c-root": "b", "c-b": "x" })
    expect(replayed.effects[0]).toEqual({
      type: "answered",
      choice: "c-root",
      option: "c",
      first: false,
    })
  })

  it("reaches the end of every route of the tree", () => {
    const leaves = scenesOf(LESSON.root).filter(
      ({ scene }) => scene.choice === undefined
    )
    expect(leaves.map(({ route }) => route.join("/"))).toEqual([
      "a",
      "b/x",
      "b/y",
      "c",
    ])
    for (const { route, scene } of leaves) {
      const beats = Array.from({ length: scene.beats.length }, () => ADVANCE)
      const end = run([...walkTo(route), ...beats])
      expect(end.state).toMatchObject({ route, at: { kind: "end" } })
    }
  })
})

describe("MK3: a choice's outcome is its first choice, and an unreached choice has none", () => {
  const event = fc.oneof(
    fc.constant(ADVANCE),
    fc.constant(BACK),
    fc.constant(RESTART),
    // Every option id in the tree, and one in none of it.
    fc.constantFrom("a", "b", "c", "x", "y", "zz").map(choose)
  )

  // Every scene's route, so each one is reached before the random events run.
  for (const { route } of scenesOf(LESSON.root)) {
    it(`holds after reaching /${route.join("/")}`, () => {
      fc.assert(
        fc.property(fc.array(event, { maxLength: 60 }), (events) => {
          let state: DramaState = start(LESSON).state
          // The oracle: what the learner was shown and picked, read off the
          // events alone and the scene the engine had open when each landed.
          const firstPicked = new Map<string, string>()
          for (const next of [...walkTo(route), ...events]) {
            const open = scenesOf(LESSON.root).find(
              ({ route: at }) => at.join("/") === state.route.join("/")
            )?.scene.choice
            const offered =
              next.type === "choose" &&
              state.at.kind === "choice" &&
              open?.options.some(({ id }) => id === next.option)
            if (offered && open && !firstPicked.has(open.id)) {
              firstPicked.set(open.id, next.option)
            }
            state = step(LESSON, state, next).state
          }
          expect(state.first).toEqual(Object.fromEntries(firstPicked))
        })
      )
    })
  }
})

describe("resume", () => {
  const point = (transition: Transition): unknown =>
    JSON.parse(JSON.stringify(transition.state))

  it("resolves a stored point to the state it was", () => {
    const stored = run([...walkTo(["b"]), ADVANCE])
    const resumed = resume(LESSON, point(stored))
    expect(resumed.state).toEqual(stored.state)
    expect(resumed.effects).toEqual([
      {
        type: "enter-scene",
        scene: "s-b",
        place: "place of s-b",
        feeling: "feeling of s-b",
      },
      { type: "voice", beat: "s-b-n2", speaker: null },
    ])
  })

  it("resolves an open choice and an ending", () => {
    const open = run([...walkTo(["b"]), ADVANCE, ADVANCE])
    expect(resume(LESSON, point(open)).state).toEqual(open.state)
    const end = run([...walkTo(["b", "y"]), ADVANCE, ADVANCE, ADVANCE])
    expect(resume(LESSON, point(end)).state).toEqual(end.state)
  })

  const opening = start(LESSON)
  const valid = {
    route: ["b"],
    at: { kind: "beat", id: "s-b-n1" },
    first: { "c-root": "b" },
  }

  it.each([
    ["garbage", "not a point"],
    [
      "a route through an option the tree no longer has",
      { ...valid, route: ["q"] },
    ],
    [
      "a beat no longer in the scene",
      { ...valid, at: { kind: "beat", id: "gone" } },
    ],
    [
      "an open choice on a leaf",
      { ...valid, route: ["a"], at: { kind: "choice" } },
    ],
    ["an ending on a scene with a choice", { ...valid, at: { kind: "end" } }],
    ["a route across a choice never answered", { ...valid, first: {} }],
    [
      "a first choice of a choice the tree lacks",
      { ...valid, first: { "c-root": "b", gone: "a" } },
    ],
    [
      "a first choice the choice does not offer",
      { ...valid, first: { "c-root": "z" } },
    ],
    [
      "a first choice below a choice never answered",
      {
        route: [],
        at: { kind: "beat", id: "s-root-n1" },
        first: { "c-b": "x" },
      },
    ],
  ])("discards %s to the root", (_name, stored) => {
    expect(resume(LESSON, stored)).toEqual(opening)
  })
})
