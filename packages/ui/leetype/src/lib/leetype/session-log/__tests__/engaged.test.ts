import { engagedOf } from "@leetype/lib/leetype/session-log/engaged"
import type {
  SessionEvent,
  SessionLog,
} from "@leetype/lib/leetype/session-log/model"
import { checkEvent, PIPELINES } from "@some-ui/engagement"
import type { EngagementEvent } from "@some-ui/engagement"
import { describe, expect, it } from "vitest"

let n = 0
const stamp = (): { id: string; at: string; session: string } => {
  n += 1
  return {
    id: `e${String(n)}`,
    at: `2026-11-13T09:${String(n).padStart(2, "0")}:00.000Z`,
    session: "s1",
  }
}
const on = { file: "t1-01-one-node.json", screen: "t1" }

const started = (): SessionEvent => ({
  ...stamp(),
  type: "started",
  file: on.file,
  form: "full",
  declaredMinutes: 20,
})
const placed = (
  reading: string,
  as: "placement" | "pointer"
): SessionEvent => ({
  ...stamp(),
  ...on,
  type: "placed",
  reading,
  as,
})
const reading = (
  name: string,
  action: "opened" | "saved" | "read" | "skipped"
): SessionEvent => ({
  ...stamp(),
  file: on.file,
  type: "reading",
  reading: name,
  action,
})
const ended = (how: "declared" | "left"): SessionEvent => ({
  ...stamp(),
  ...on,
  type: "ended",
  how,
})

/** Every engagement event a log says, as the runtime tells them, event by event. */
function play(events: ReadonlyArray<SessionEvent>): Array<EngagementEvent> {
  const told: Array<EngagementEvent> = []
  let log: SessionLog = []
  for (const event of events) {
    told.push(...engagedOf(log, event))
    log = [...log, event]
  }
  return told
}

const said = (told: ReadonlyArray<EngagementEvent>): Array<string> =>
  told.map((e) =>
    e.kind === "left"
      ? `${e.affordance} left in ${e.place}`
      : e.kind === "passed-over"
        ? `${e.affordance} passed over (${e.ending})`
        : `${e.affordance} ${e.kind}`
  )

describe("the session log in ENGAGE's words (ENG5)", () => {
  it("offers a reading when placed, takes it when opened, and leaves the file in it", () => {
    const told = play([
      started(),
      placed("r1", "placement"),
      reading("r1", "opened"),
      ended("left"),
    ])
    expect(said(told)).toEqual([
      "session-file taken",
      "reading offered",
      "reading taken",
      "session-file left in reading",
    ])
    for (const event of told)
      expect(checkEvent(event, PIPELINES)).toMatchObject({ ok: true })
    expect(JSON.stringify(told)).not.toContain("r1")
  })

  it("passes a skipped one over as put away, and one never settled as moved on", () => {
    const told = play([
      started(),
      placed("r1", "pointer"),
      reading("r1", "skipped"),
      placed("r2", "placement"),
      reading("r1", "opened"),
      ended("declared"),
    ])
    expect(said(told)).toEqual([
      "session-file taken",
      "pointer offered",
      "pointer passed over (put-away)",
      "reading offered",
      "reading passed over (moved-on)",
    ])
  })

  it("leaves the file in a round once its reading is read", () => {
    const told = play([
      started(),
      placed("r1", "placement"),
      reading("r1", "opened"),
      reading("r1", "read"),
      ended("left"),
    ])
    expect(said(told).at(-1)).toBe("session-file left in round")
  })

  it("says nothing for an event the log already keeps", () => {
    const first = started()
    expect(engagedOf([first], first)).toEqual([])
  })
})
