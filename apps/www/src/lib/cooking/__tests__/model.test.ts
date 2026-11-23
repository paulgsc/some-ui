/**
 * @vitest-environment node
 *
 * Where each train stands: the first leg not done, who holds it and what it
 * waits on, from what GitHub and the run's record say (C1116, C1162).
 */
import { refKey } from "@some-ui/video-render"
import { describe, expect, it } from "vitest"

import { hereOf, onYou, runKey } from "@/lib/cooking/model"
import { COOKING_WORDS as W } from "@/lib/cooking/words"

import { ask, FACTS, factsWith, pr, RUN, run, trainOf } from "./fixtures"

describe("a train", () => {
  it("stands at its first leg not done, the ones before passed, the destination last", () => {
    const t = trainOf("G1")
    expect(t.stops.map((s) => s.state)).toEqual([
      "passed",
      "here",
      "ahead",
      "ahead",
    ])
    expect(t.stops.at(-1)?.label).toBe("Home runs today's release")
    expect(hereOf(t)).toMatchObject({
      holder: "checks",
      now: W.now.checksRunning(3, 5),
    })
  })

  it("names an ask's step by what the ask says of it", () => {
    expect(trainOf("G1").stops[2]?.label).toBe("Deploy home")
  })

  it("is the owner's when its run waits on their approval or a step of theirs", () => {
    expect(onYou(trainOf("G2"))).toBe(true)
    expect(hereOf(trainOf("G2")).label).toBe("Install the APK")
    const approval = factsWith({
      runs: new Map([
        [
          runKey("some-ui", 45065710340),
          run({ state: "approval", endedAt: null }),
        ],
      ]),
    })
    expect(hereOf(trainOf("G2", approval))).toMatchObject({
      holder: "you",
      now: W.now.approve,
    })
  })

  it("waits on another train as that train's holder", () => {
    const essay = trainOf("G3")
    expect(hereOf(essay)).toMatchObject({
      label: W.waitsOn("Deploy home"),
      holder: "checks",
      link: { kind: "goal", goal: "G1" },
    })
  })

  it("arrives when every leg is done, the owner's cleared by the record", () => {
    const merged = pr({ state: "merged", mergedAt: "2026-11-22T21:00:00Z" })
    const facts = factsWith({
      prs: new Map([
        [refKey({ repo: "server", number: 1125 }), merged],
        [refKey({ repo: "server", number: 1129 }), merged],
      ]),
    })
    const cleared = {
      ...RUN,
      cleared: [{ goal: "G1", leg: 2, at: "2026-11-22T22:00:00Z" }],
    }
    const t = trainOf("G1", facts, cleared)
    expect(t.arrived).toBe(true)
    expect(hereOf(t)).toMatchObject({
      leg: "arrive",
      now: W.now.arrived,
      holder: null,
    })
    expect(trainOf("G3", facts, cleared).stops[0]?.state).toBe("passed")
  })

  it("draws a leg further down that is already done as passed, an ask closed counting as done", () => {
    const closed = factsWith({
      asks: new Map([
        [refKey({ repo: "some-ui", number: 3433 }), { ...ask, open: false }],
      ]),
    })
    const essay = trainOf("G3", closed)
    expect(essay.stops.map((s) => s.state)).toEqual([
      "here",
      "passed",
      "ahead",
      "ahead",
    ])
    expect(essay.stops[1]).toMatchObject({ holder: "you", now: W.now.done })
    // The ask closed counts every step of it done, so that train arrived.
    expect(trainOf("G2", closed).arrived).toBe(true)
  })

  it("hands a failed check or a run that failed to Claude, and a green one waiting to merge too", () => {
    const failed = factsWith({
      prs: new Map([
        [
          refKey({ repo: "some-ui", number: 3432 }),
          pr({
            checks: {
              waiting: 0,
              running: 0,
              passed: 9,
              failed: 1,
              approval: 0,
            },
          }),
        ],
      ]),
    })
    expect(hereOf(trainOf("G5", failed))).toMatchObject({
      holder: "claude",
      now: W.now.checkFailed(1),
    })
    const green = factsWith({
      prs: new Map([[refKey({ repo: "some-ui", number: 3432 }), pr({})]]),
    })
    expect(hereOf(trainOf("G5", green))).toMatchObject({
      holder: "claude",
      now: W.now.readyToMerge,
    })
    expect(hereOf(trainOf("G5"))).toMatchObject({
      holder: "checks",
      now: W.now.waitingForRunner,
    })
  })

  it("hands a check that waits on an approval to the owner", () => {
    const approval = factsWith({
      prs: new Map([
        [
          refKey({ repo: "some-ui", number: 3432 }),
          pr({
            checks: {
              waiting: 0,
              running: 1,
              passed: 3,
              failed: 0,
              approval: 1,
            },
          }),
        ],
      ]),
    })
    expect(hereOf(trainOf("G5", approval))).toMatchObject({
      holder: "you",
      now: W.now.approve,
    })
  })

  it("names a decision ask by its question", () => {
    const decision = {
      ...RUN,
      goals: RUN.goals.map((g) =>
        g.id === "G7"
          ? {
              ...g,
              legs: [
                {
                  leg: "yours" as const,
                  ask: {
                    repo: "some-ui" as const,
                    kind: "issue" as const,
                    number: 3433,
                  },
                },
              ],
            }
          : g
      ),
    }
    expect(hereOf(trainOf("G7", FACTS, decision)).label).toBe(ask.question)
  })

  it("keeps a leg it couldn't read where it is, and says so", () => {
    const unread = factsWith({
      prs: new Map([[refKey({ repo: "some-ui", number: 3432 }), null]]),
    })
    expect(hereOf(trainOf("G5", unread))).toMatchObject({
      holder: "checks",
      now: W.unread,
    })
  })

  it("follows a worker's work by its phase and log", () => {
    const g7 = {
      ...RUN,
      cleared: [{ goal: "G7", leg: 0, at: "2026-11-22T22:00:00Z" }],
    }
    const t = trainOf("G7", FACTS, g7)
    expect(hereOf(t)).toMatchObject({
      holder: "claude",
      now: W.phase.building,
      since: "2026-11-22T20:53:55Z",
    })
    const ready = {
      ...g7,
      workers: g7.workers.map((w) => ({ ...w, phase: "ready" as const })),
    }
    expect(trainOf("G7", FACTS, ready).arrived).toBe(true)
  })

  it("lists what happened at a stop newest first", () => {
    const merged = factsWith({
      prs: new Map([
        [
          refKey({ repo: "server", number: 1125 }),
          pr({ state: "merged", mergedAt: "2026-11-22T21:00:00Z" }),
        ],
      ]),
    })
    expect(trainOf("G1", merged).stops[0]?.log.map((l) => l.says)).toEqual([
      W.log.merged,
      W.log.opened,
    ])
  })
})
