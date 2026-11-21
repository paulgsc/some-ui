import { checkEvent } from "@engagement/lib/check-event"
import type { EngagementEvent } from "@engagement/lib/events"
import { PIPELINES } from "@engagement/lib/pipelines"
import type { PlaceOf } from "@engagement/lib/places"
import { createPlaces, stepPlace, watchPlaces } from "@engagement/lib/places"
import type { VisitPage } from "@engagement/lib/visit"
import { describe, expect, it } from "vitest"

const PICK: PlaceOf = {
  pipeline: "jobs",
  affordance: "todays-pick",
  surface: "apk",
}

const AT = "2026-11-21T09:00:00.000Z"
const LATER = "2026-11-21T09:02:00.000Z"

function places(): {
  places: ReturnType<typeof createPlaces<string>>
  sent: Array<EngagementEvent>
} {
  const sent: Array<EngagementEvent> = []
  let minute = 0
  const clock = (): Date => new Date(Date.UTC(2026, 10, 21, 9, minute++))
  return {
    places: createPlaces(PICK, clock, (event) => sent.push(event)),
    sent,
  }
}

const said = (sent: ReadonlyArray<EngagementEvent>): Array<string> =>
  sent.map((e) =>
    e.kind === "left" ? `left ${e.place} since ${e.startedAt}` : e.kind
  )

describe("an affordance's places", () => {
  it("takes a place as it comes on screen, and leaves it, naming it and since when", () => {
    const first = stepPlace(PICK, null, "read", AT)
    expect(said(first.events)).toEqual(["taken"])
    const second = stepPlace(PICK, first.open, "decide", LATER)
    expect(said(second.events)).toEqual([`left read since ${AT}`, "taken"])
    const gone = stepPlace(PICK, second.open, null, LATER)
    expect(said(gone.events)).toEqual([`left decide since ${LATER}`])
    expect(gone.open).toBeNull()
  })

  it("says nothing while the same place stays on screen", () => {
    const open = stepPlace(PICK, null, "read", AT).open
    expect(stepPlace(PICK, open, "read", LATER).events).toEqual([])
    expect(stepPlace(PICK, null, null, AT).events).toEqual([])
  })

  it("leaves the place while the app is at the back, and takes it again in front", () => {
    const { places: p, sent } = places()
    p.at("apply")
    p.hidden(true)
    p.hidden(true)
    p.hidden(false)
    p.at(null)
    expect(sent.map((e) => e.kind)).toEqual(["taken", "left", "taken", "left"])
  })

  it("only names places its affordance has, so every event it sends checks", () => {
    const { places: p, sent } = places()
    p.at("read")
    p.at("ending")
    p.at(null)
    for (const event of sent) expect(checkEvent(event, PIPELINES).ok).toBe(true)
  })

  it("follows the page's visibility, and leaves as the screen closes", () => {
    const target = new EventTarget()
    let shown: DocumentVisibilityState = "visible"
    const page: VisitPage = {
      get visibilityState() {
        return shown
      },
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
    }
    const { places: p, sent } = places()
    const stop = watchPlaces(p, page)
    p.at("read")
    shown = "hidden"
    target.dispatchEvent(new Event("visibilitychange"))
    shown = "visible"
    target.dispatchEvent(new Event("visibilitychange"))
    stop()
    target.dispatchEvent(new Event("visibilitychange"))
    expect(sent.map((e) => e.kind)).toEqual(["taken", "left", "taken", "left"])
  })
})
