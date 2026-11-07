import type { EngagementEvent } from "@engagement/lib/events"
import { setEngagementSink } from "@engagement/lib/sink"
import type { Offer, VisitPage } from "@engagement/lib/visit"
import { createVisit, pageVisit, watchVisit } from "@engagement/lib/visit"
import { describe, expect, it } from "vitest"

const offer = (affordance: string, item: string): Offer => ({
  pipeline: "topik",
  affordance,
  surface: "apk",
  key: `${affordance}:${item}`,
})

const readAloud = offer("routine-read-aloud", "scene/a")
const lens = offer("routine-lens", "scene/a")
const drama = offer("routine-drama", "drama/b")

function visit(): {
  visit: ReturnType<typeof createVisit>
  sent: Array<EngagementEvent>
} {
  const sent: Array<EngagementEvent> = []
  let minute = 0
  const clock = (): Date => new Date(Date.UTC(2026, 10, 7, 9, minute++))
  return { visit: createVisit(clock, (event) => sent.push(event)), sent }
}

const kinds = (sent: ReadonlyArray<EngagementEvent>): Array<string> =>
  sent.map((event) => `${event.kind} ${event.affordance}`)

describe("a visit (ENG3)", () => {
  it("offers each listed card once a visit, however often the list is drawn", () => {
    const { visit: v, sent } = visit()
    v.show("list", [readAloud, lens])
    v.show("list", [readAloud, lens, drama])
    expect(kinds(sent)).toEqual([
      "offered routine-read-aloud",
      "offered routine-lens",
      "offered routine-drama",
    ])
  })

  it("passes over what wasn't taken when it ends, as took-another when one was", () => {
    const { visit: v, sent } = visit()
    v.show("list", [readAloud, lens, drama])
    v.take(readAloud)
    v.end("moved-on")
    const passed = sent.filter((event) => event.kind === "passed-over")
    expect(passed.map((event) => event.affordance)).toEqual([
      "routine-lens",
      "routine-drama",
    ])
    expect(passed[0]).toMatchObject({
      ending: "took-another",
      offeredAt: "2026-11-07T09:01:00.000Z",
    })
  })

  it("ends as the visit did when nothing was taken, and offers again only what is shown", () => {
    const { visit: v, sent } = visit()
    v.show("list", [drama])
    v.end("left-the-app")
    v.appear()
    v.show("list", null)
    v.end("moved-on")
    v.appear()
    expect(sent.map((event) => event.kind)).toEqual([
      "offered",
      "passed-over",
      "offered",
      "passed-over",
    ])
    expect(sent[1]).toMatchObject({ ending: "left-the-app" })
  })

  it("offers what is taken without an offer, then takes it", () => {
    const { visit: v, sent } = visit()
    v.take(lens)
    v.take(lens)
    expect(kinds(sent)).toEqual([
      "offered routine-lens",
      "taken routine-lens",
      "taken routine-lens",
    ])
  })

  it("watches the page: the back ends a visit, the front begins one, closing ends it", () => {
    const { visit: v, sent } = visit()
    const target = new EventTarget()
    let shown: DocumentVisibilityState = "visible"
    const page: VisitPage = {
      get visibilityState() {
        return shown
      },
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
    }
    const stop = watchVisit(v, page)
    v.show("list", [drama])
    shown = "hidden"
    target.dispatchEvent(new Event("visibilitychange"))
    shown = "visible"
    target.dispatchEvent(new Event("visibilitychange"))
    stop()
    target.dispatchEvent(new Event("visibilitychange"))
    expect(
      sent.map((event) =>
        event.kind === "passed-over"
          ? `${event.kind} ${event.ending}`
          : event.kind
      )
    ).toEqual([
      "offered",
      "passed-over left-the-app",
      "offered",
      "passed-over moved-on",
    ])
  })

  it("holds what is shown while the app is at the back, and offers it on return", () => {
    const { visit: v, sent } = visit()
    v.leave()
    v.show("list", [drama])
    expect(sent).toEqual([])
    v.appear()
    expect(kinds(sent)).toEqual(["offered routine-drama"])
  })

  it("starts away on a hidden page, so a shelf shown before the watch offers nothing", () => {
    const sent: Array<EngagementEvent> = []
    const target = new EventTarget()
    const hidden: VisitPage = {
      visibilityState: "hidden",
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
    }
    setEngagementSink((event) => sent.push(event))
    const v = pageVisit(hidden)
    v.show("list", [drama])
    expect(sent).toEqual([])
    v.appear()
    setEngagementSink(null)
    expect(kinds(sent)).toEqual(["offered routine-drama"])
  })
})
