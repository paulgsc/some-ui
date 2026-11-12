/**
 * @vitest-environment node
 *
 * Where a render stands on home's conveyor (#2899): every state home's board
 * can say, with and without the worker's progress, comes to one station on
 * the line, a side track only while paused, and words in the person's terms.
 */
import { describe, expect, it } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import {
  CONVEYOR_WORDS,
  nowAside,
  nowStation,
  ROW_TAGS,
  stationLine,
  STATIONS,
} from "@/lib/renders/conveyor"
import type { Now, Phase, Progress } from "@/lib/renders/model"
import { readBoard } from "@/lib/renders/model"

const PHASES: ReadonlyArray<Phase> = [
  "waiting",
  "rendering",
  "paused",
  "finishing",
]

const PROGRESS: ReadonlyArray<Progress | null | undefined> = [
  undefined,
  null,
  { station: "recording", scene: 4, scenes: 9, since: 0 },
  { station: "recording", scene: null, scenes: null, since: 0 },
  { station: "recording", scene: 12, scenes: 9, since: 0 },
  { station: "assembling", scene: null, scenes: null, since: 0 },
  { station: "a-station-from-later", scene: 1, scenes: 2, since: 0 },
]

const now = (state: Phase, progress: Progress | null | undefined): Now => ({
  feed: "preview",
  key: "conference-call-20261112T024837Z",
  template: "conference-call",
  state,
  since: 0,
  stateSince: 0,
  gaveWay: 0,
  heldBy: null,
  stuck: false,
  estimate: null,
  ...(progress === undefined ? {} : { progress }),
})

const every = PHASES.flatMap((state) => PROGRESS.map((p) => now(state, p)))

function strings(value: unknown): Array<string> {
  if (typeof value === "string") return [value]
  if (typeof value === "object" && value !== null)
    return Object.values(value).flatMap(strings)
  return []
}

describe("home's conveyor", () => {
  it("puts every state home can say at a station on the line", () => {
    for (const n of every) expect(STATIONS).toContain(nowStation(n))
  })

  it("reads each state as its station", () => {
    expect(nowStation(now("waiting", undefined))).toBe("room")
    expect(nowStation(now("rendering", undefined))).toBe("oven")
    expect(nowStation(now("rendering", PROGRESS[5]))).toBe("boxing")
    expect(nowStation(now("paused", PROGRESS[2]))).toBe("oven")
    expect(nowStation(now("finishing", undefined))).toBe("boxing")
  })

  it("sets it on the counter only while paused", () => {
    for (const n of every)
      expect(nowAside(n)).toBe(n.state === "paused" ? "counter" : null)
  })

  it("says which scene only where home says one it can stand behind", () => {
    expect(stationLine(now("rendering", PROGRESS[2]))).toBe(
      "Recording scene 4 of 9."
    )
    expect(stationLine(now("rendering", PROGRESS[3]))).toBeNull()
    expect(stationLine(now("rendering", PROGRESS[4]))).toBeNull()
    expect(stationLine(now("rendering", PROGRESS[5]))).toBe(
      "Putting the scenes together."
    )
    expect(stationLine(now("rendering", PROGRESS[6]))).toBeNull()
    expect(stationLine(now("rendering", undefined))).toBeNull()
  })

  it("names no machinery, in anything it can say", () => {
    const said = [
      ...strings(CONVEYOR_WORDS),
      ...strings(ROW_TAGS),
      ...every.map((n) => stationLine(n) ?? ""),
    ]
    for (const line of said) expect(line, line).not.toMatch(MACHINERY)
  })

  it("reads a board with the worker's progress, and one from a home without it", () => {
    const board = (progress: unknown): string =>
      JSON.stringify({
        now: { ...now("rendering", undefined), progress },
        waiting: [],
        failed: [],
        done: [],
        coming: [],
      })
    const withProgress = readBoard({
      status: 200,
      body: board({ station: "recording", scene: 4, scenes: 9, since: 1 }),
    })
    expect(
      withProgress.kind === "read" && withProgress.board.now?.progress?.scene
    ).toBe(4)
    expect(readBoard({ status: 200, body: board(null) }).kind).toBe("read")
    expect(
      readBoard({
        status: 200,
        body: JSON.stringify({
          now: now("rendering", undefined),
          waiting: [],
          failed: [],
          done: [],
          coming: [],
        }),
      }).kind
    ).toBe("read")
  })
})
