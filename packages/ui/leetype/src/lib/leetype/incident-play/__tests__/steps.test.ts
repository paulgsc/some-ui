import type {
  Play,
  PlayInput,
  StepContext,
} from "@leetype/lib/leetype/incident-play/model"
import {
  declaredMinutes,
  startPlay,
  step,
} from "@leetype/lib/leetype/incident-play/model"
import type { SessionEvent } from "@leetype/lib/leetype/session-log/model"
import type { SessionFile } from "@leetype/types/session-file"
import { SessionFileSchema } from "@leetype/types/session-file"
import { describe, expect, it } from "vitest"

const SOURCE = {
  title: "A source",
  author: "Someone",
  year: 2020,
  where: "Somewhere",
  url: "https://example.com/source",
  minutes: 5,
}

/**
 * i1 → r1 round (right → p1 pointer, no effects; wrong → g1 placement:
 * "Read now" → v1, a `parked-return` return; "Skip" → r2) → r2 round → k1,
 * the take's choice ("No take today" passes) → t1 take (weak → g2, whose
 * only way on is v1) → e1 end.
 */
const FILE = SessionFileSchema.parse({
  title: "A small session",
  oneLine: "Two rounds and a take.",
  session: { kind: "incident", budgetMinutes: 8 },
  glossary: { quorum: "a majority of the voters" },
  start: "i1",
  screens: {
    i1: {
      type: "info",
      glosses: ["quorum"],
      actions: [{ label: "Go", next: "r1" }],
    },
    r1: {
      type: "choice",
      title: "Round one",
      options: [
        { label: "Right", next: "p1", correct: true },
        { label: "Wrong", next: "g1", correct: false, feedback: "breaks" },
      ],
    },
    g1: {
      type: "reading",
      primer: "Why",
      source: SOURCE,
      actions: [
        { label: "Read now", next: "v1", effect: "read" },
        { label: "Skip", next: "r2" },
      ],
    },
    v1: {
      type: "choice",
      tags: ["parked-return"],
      options: [
        { label: "Right again", next: "r2", correct: true },
        { label: "Wrong again", next: "r2", correct: false },
      ],
    },
    p1: {
      type: "reading",
      primer: "More",
      source: SOURCE,
      actions: [{ label: "On", next: "r2" }],
    },
    r2: {
      type: "choice",
      title: "Round two",
      options: [
        { label: "Right", next: "k1", correct: true },
        { label: "Wrong", next: "k1", correct: false },
      ],
    },
    k1: {
      type: "choice",
      tags: ["speak"],
      options: [
        { label: "Take it", next: "t1" },
        { label: "No take today", next: "e1", abstain: true },
      ],
    },
    t1: {
      type: "record",
      prompt: "Say why",
      maxSeconds: 60,
      rubric: ["one", "two"],
      weakIfFewerThan: 2,
      next: "e1",
      onWeak: "g2",
    },
    g2: {
      type: "reading",
      primer: "Why the take",
      source: SOURCE,
      actions: [{ label: "Try one", next: "v1" }],
    },
    e1: { type: "end" },
  },
})

function playThrough(
  inputs: ReadonlyArray<PlayInput>,
  options: {
    file?: SessionFile
    form?: "full" | "short"
    from?: Parameters<typeof startPlay>[0]["from"]
    hiddenMs?: number
  } = {}
): { play: Play; events: Array<SessionEvent> } {
  let id = 0
  const ctx = (at: number): StepContext => ({
    at,
    newId: () => `e${String(++id)}`,
    medianMs: null,
    hiddenMs: options.hiddenMs ?? 0,
  })
  const started = startPlay(
    {
      fileName: "small",
      file: options.file ?? FILE,
      session: "s1",
      form: options.form ?? "full",
      ...(options.from === undefined ? {} : { from: options.from }),
    },
    ctx(0)
  )
  let play = started.play
  const events = [...started.events]
  inputs.forEach((input, index) => {
    const stepped = step(play, input, ctx((index + 1) * 1000))
    play = stepped.play
    events.push(...stepped.events)
  })
  return { play, events }
}

const GO = { type: "act", action: 0 } as const
const RIGHT = { type: "pick", option: 0 } as const
const WRONG = { type: "pick", option: 1 } as const
const ON = { type: "continue" } as const

describe("an incident session's steps, on a small file", () => {
  it("gives the short form's second round way to the take", () => {
    const { play } = playThrough([GO, RIGHT, ON, GO], { form: "short" })
    expect(play.screen).toBe("k1")
  })

  it("ends the short form where no take is left, without looping", () => {
    const noTake = SessionFileSchema.parse({
      ...FILE,
      screens: {
        ...FILE.screens,
        k1: { ...FILE.screens.k1, tags: [] },
      },
    })
    const { play, events } = playThrough([GO, RIGHT, ON, GO], {
      file: noTake,
      form: "short",
    })
    expect(play).toMatchObject({ screen: "e1", ended: "declared" })
    expect(events.at(-1)).toMatchObject({ type: "ended", how: "declared" })
  })

  it("records a reading's choice only where the reading offers one", () => {
    const pointer = playThrough([GO, RIGHT, ON, GO])
    expect(pointer.play.screen).toBe("r2")
    expect(pointer.events.map((event) => event.type)).not.toContain("reading")

    const placed = playThrough([GO, WRONG, ON, { type: "act", action: 1 }])
    expect(placed.events.at(-1)).toMatchObject({
      type: "reading",
      reading: "g1",
      action: "skipped",
    })
  })

  it("takes the take's abstention as the spoken answer's pass", () => {
    const { play, events } = playThrough([GO, RIGHT, ON, GO, RIGHT, ON, WRONG])
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "spoken",
        screen: "k1",
        answer: { as: "passed" },
      })
    )
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: "picked", screen: "k1" })
    )
    expect(play).toMatchObject({ screen: "e1", ended: "declared" })
  })

  it("returns a round only to a round: a take's placement leads to a fresh one", () => {
    const { play, events } = playThrough([
      GO,
      RIGHT,
      ON,
      GO,
      RIGHT,
      ON,
      RIGHT,
      { type: "pass" },
      { type: "ticked", ticks: [] },
      { type: "ask-return" },
      RIGHT,
    ])
    expect(play.screen).toBe("v1")
    expect(events).toContainEqual(
      expect.objectContaining({ type: "placed", screen: "t1", reading: "g2" })
    )
    expect(events.at(-1)).toMatchObject({ type: "picked", screen: "v1" })
    expect(events.map((event) => event.type)).not.toContain("returned")
  })

  it("plays a parked round's return from the first screen, and ends after it", () => {
    const { play, events } = playThrough([RIGHT, ON], {
      form: "short",
      from: { round: "r1", reading: "g1", take: "return", asked: false },
    })
    expect(events[0]).toMatchObject({ type: "started", declaredMinutes: 2 })
    expect(events[1]).toMatchObject({
      type: "returned",
      screen: "r1",
      variant: "v1",
      asked: false,
    })
    expect(play.ended).toBe("declared")
  })

  it("carries a struggle's placement through an info screen to its reading", () => {
    const r1 = FILE.screens.r1
    if (r1?.type !== "choice") throw new Error("r1 is not a choice")
    const viaInfo = SessionFileSchema.parse({
      ...FILE,
      screens: {
        ...FILE.screens,
        r1: {
          ...r1,
          options: r1.options.map((option) =>
            option.correct ? option : { ...option, next: "n1" }
          ),
        },
        n1: { type: "info", actions: [{ label: "On to it", next: "g1" }] },
      },
    })
    const { play, events } = playThrough(
      [GO, WRONG, ON, GO, { type: "ask-return" }, RIGHT],
      { file: viaInfo }
    )
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "placed",
        screen: "r1",
        reading: "g1",
        as: "placement",
      })
    )
    expect(play.screen).toBe("v1")
    expect(events.at(-1)).toMatchObject({
      type: "returned",
      screen: "r1",
      variant: "v1",
      asked: true,
    })
  })

  it("takes a parked round's return at a round boundary, then comes back to where it left", () => {
    const skip = { type: "act", action: 1 } as const
    const away = playThrough([
      GO,
      WRONG,
      ON,
      skip,
      {
        type: "take-parked",
        round: "r1",
        reading: "g1",
        take: "return",
        asked: true,
      },
    ])
    expect(away.play).toMatchObject({ screen: "v1", scope: "round" })

    const { play, events } = playThrough([
      GO,
      WRONG,
      ON,
      skip,
      {
        type: "take-parked",
        round: "r1",
        reading: "g1",
        take: "return",
        asked: true,
      },
      { type: "pick", option: 1 },
      ON,
    ])
    expect(events).toContainEqual(
      expect.objectContaining({ type: "returned", screen: "r1", asked: true })
    )
    expect(play).toMatchObject({
      screen: "r2",
      scope: "file",
      resume: null,
      ended: null,
    })
  })

  it("plays a parked round itself as a detour, through its placement, and back", () => {
    const skip = { type: "act", action: 1 } as const
    const { play, events } = playThrough([
      GO,
      WRONG,
      ON,
      skip,
      RIGHT,
      ON,
      {
        type: "take-parked",
        round: "r1",
        reading: "g1",
        take: "round",
        asked: true,
      },
      WRONG,
      ON,
      skip,
    ])
    expect(
      events.filter((event) => event.type === "picked" && event.screen === "r1")
    ).toHaveLength(2)
    // Its way on leads to r2; the detour comes back to the take it left.
    expect(play).toMatchObject({ screen: "k1", scope: "file", resume: null })
  })

  it("takes no parked round in the middle of a reveal", () => {
    const { play } = playThrough([
      GO,
      WRONG,
      {
        type: "take-parked",
        round: "r1",
        reading: "g1",
        take: "round",
        asked: true,
      },
    ])
    expect(play).toMatchObject({ screen: "r1", scope: "file" })
  })

  it("leaves time in the background out of a selection's time", () => {
    const { events } = playThrough([GO, RIGHT], { hiddenMs: 700 })
    // Shown at 1000, picked at 2000, 700 of it in the background.
    expect(events.at(-1)).toMatchObject({ type: "picked", ms: 300 })
  })
})

describe("declaredMinutes", () => {
  it("is never longer than the time the host leaves, and never under a minute", () => {
    expect(declaredMinutes(FILE, "full", false)).toBe(8)
    expect(declaredMinutes(FILE, "short", false)).toBe(5)
    expect(declaredMinutes(FILE, "full", true)).toBe(2)
    expect(declaredMinutes(FILE, "full", false, 6.5)).toBe(6)
    expect(declaredMinutes(FILE, "short", false, 0.2)).toBe(1)
  })
})
