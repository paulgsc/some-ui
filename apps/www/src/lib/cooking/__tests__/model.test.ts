/**
 * @vitest-environment node
 *
 * Where each train stands: the first leg not done, who holds it and what it
 * waits on, from what GitHub and the run's record say (C1116, C1162).
 */
import { describe, expect, it } from "vitest"

import {
  askKey,
  hereOf,
  onYou,
  prKey,
  runKey,
  trainsOf,
} from "@/lib/cooking/model"
import type { Train } from "@/lib/cooking/model"
import { COOKING_WORDS as W } from "@/lib/cooking/words"

import { ask, FACTS, factsWith, pr, RUN, run } from "./fixtures"

const train = (id: string, facts = FACTS, record = RUN): Train => {
  const t = trainsOf(record, facts).find((x) => x.id === id)
  if (t === undefined) throw new Error(id)
  return t
}

describe("a train", () => {
  it("stands at its first leg not done, the ones before passed, the destination last", () => {
    const t = train("G1")
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
    expect(train("G1").stops[2]?.label).toBe("Deploy home")
  })

  it("is the owner's when its run waits on their approval or a step of theirs", () => {
    expect(onYou(train("G2"))).toBe(true)
    expect(hereOf(train("G2")).label).toBe("Install the APK")
    const approval = factsWith({
      runs: new Map([
        [
          runKey("some-ui", 45065710340),
          run({ state: "approval", endedAt: null }),
        ],
      ]),
    })
    expect(hereOf(train("G2", approval))).toMatchObject({
      holder: "you",
      now: W.now.approve,
    })
  })

  it("waits on another train as that train's holder, and passes when it arrives", () => {
    const essay = train("G3")
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
        [prKey({ repo: "server", number: 1125 }), merged],
        [prKey({ repo: "server", number: 1129 }), merged],
      ]),
    })
    const cleared = {
      ...RUN,
      cleared: [{ goal: "G1", leg: 2, at: "2026-11-22T22:00:00Z" }],
    }
    const t = train("G1", facts, cleared)
    expect(t.arrived).toBe(true)
    expect(hereOf(t)).toMatchObject({
      leg: "arrive",
      now: W.now.arrived,
      holder: null,
    })
    expect(train("G3", facts, cleared).stops[0]?.state).toBe("passed")
  })

  it("counts an ask closed as every step of it done", () => {
    const closed = factsWith({
      asks: new Map([
        [askKey({ repo: "some-ui", number: 3433 }), { ...ask, open: false }],
      ]),
    })
    expect(train("G2", closed).arrived).toBe(true)
  })

  it("hands a failed check or a run that failed to Claude, and a green one waiting to merge too", () => {
    const failed = factsWith({
      prs: new Map([
        [
          prKey({ repo: "some-ui", number: 3432 }),
          pr({ checks: { waiting: 0, running: 0, passed: 9, failed: 1 } }),
        ],
      ]),
    })
    expect(hereOf(train("G5", failed))).toMatchObject({
      holder: "claude",
      now: W.now.checkFailed(1),
    })
    const green = factsWith({
      prs: new Map([[prKey({ repo: "some-ui", number: 3432 }), pr({})]]),
    })
    expect(hereOf(train("G5", green))).toMatchObject({
      holder: "claude",
      now: W.now.readyToMerge,
    })
    expect(hereOf(train("G5"))).toMatchObject({
      holder: "checks",
      now: W.now.waitingForRunner,
    })
  })

  it("keeps a leg it couldn't read where it is, and says so", () => {
    const unread = factsWith({
      prs: new Map([[prKey({ repo: "some-ui", number: 3432 }), null]]),
    })
    expect(hereOf(train("G5", unread))).toMatchObject({
      holder: "checks",
      now: W.unread,
    })
  })

  it("follows a worker's work by its phase and log", () => {
    const g7 = {
      ...RUN,
      cleared: [{ goal: "G7", leg: 0, at: "2026-11-22T22:00:00Z" }],
    }
    const t = train("G7", FACTS, g7)
    expect(hereOf(t)).toMatchObject({
      holder: "claude",
      now: W.phase.building,
      since: "2026-11-22T20:53:55Z",
    })
    const ready = {
      ...g7,
      workers: g7.workers.map((w) => ({ ...w, phase: "ready" as const })),
    }
    expect(train("G7", FACTS, ready).arrived).toBe(true)
  })

  it("lists what happened at a stop newest first", () => {
    const merged = factsWith({
      prs: new Map([
        [
          prKey({ repo: "server", number: 1125 }),
          pr({ state: "merged", mergedAt: "2026-11-22T21:00:00Z" }),
        ],
      ]),
    })
    expect(train("G1", merged).stops[0]?.log.map((l) => l.says)).toEqual([
      W.log.merged,
      W.log.opened,
    ])
  })
})
