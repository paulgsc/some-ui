import { checkEvent } from "@engagement/lib/check-event"
import type { EngagementEvent } from "@engagement/lib/events"
import { PIPELINES } from "@engagement/lib/pipelines"
import type { PlaceOf } from "@engagement/lib/places"
import {
  createHandoff,
  createPlaces,
  stepPlace,
  watchPlaces,
} from "@engagement/lib/places"
import type { VisitPage } from "@engagement/lib/visit"
import { describe, expect, it } from "vitest"

const PICK: PlaceOf = {
  pipeline: "jobs",
  affordance: "todays-pick",
  surface: "apk",
}

const AT = "2026-11-21T09:00:00.000Z"
const LATER = "2026-11-21T09:02:00.000Z"

/** A hand-off whose turn ends when the test says (`end`). */
function turn(): {
  handoff: ReturnType<typeof createHandoff>
  end: () => void
} {
  const waiting: Array<() => void> = []
  return {
    handoff: createHandoff((run) => waiting.push(run)),
    end: (): void => {
      for (const run of waiting.splice(0)) run()
    },
  }
}

function places(of: PlaceOf = PICK): {
  places: ReturnType<typeof createPlaces<string>>
  sent: Array<EngagementEvent>
  end: () => void
  also: (other: PlaceOf) => ReturnType<typeof createPlaces<string>>
} {
  const sent: Array<EngagementEvent> = []
  let minute = 0
  const clock = (): Date => new Date(Date.UTC(2026, 10, 21, 9, minute++))
  const { handoff, end } = turn()
  const record = (event: EngagementEvent): void => {
    sent.push(event)
  }
  return {
    places: createPlaces(of, clock, record, handoff),
    sent,
    end,
    also: (other) => createPlaces(other, clock, record, handoff),
  }
}

const said = (sent: ReadonlyArray<EngagementEvent>): Array<string> =>
  sent.map((e) =>
    e.kind === "left"
      ? `left ${e.place} since ${e.startedAt}${e.next === undefined ? "" : ` to ${e.next}`}`
      : e.kind
  )

describe("an affordance's places", () => {
  it("takes a place as it comes on screen, and leaves it, naming it and since when", () => {
    const first = stepPlace(PICK, null, "read", AT)
    expect(said(first.events)).toEqual(["taken"])
    const second = stepPlace(PICK, first.open, "decide", LATER)
    expect(said(second.events)).toEqual([
      `left read since ${AT} to decide`,
      "taken",
    ])
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
    const { places: p, sent, end } = places()
    p.at("apply")
    p.hidden(true)
    p.hidden(true)
    p.hidden(false)
    p.at(null)
    end()
    expect(sent.map((e) => e.kind)).toEqual(["taken", "left", "taken", "left"])
    // Put away, or closed into nothing that names a place: no next is guessed.
    expect(
      sent.filter((e) => e.kind === "left" && e.next !== undefined)
    ).toEqual([])
  })

  it("only names places and screens it has, so every event it sends checks", () => {
    const { places: p, sent, end, also } = places()
    p.at("read")
    p.at("ending")
    p.at(null)
    also({ pipeline: "jobs", affordance: "today", surface: "apk" }).at("today")
    end()
    expect(said(sent)).toContain(
      "left ending since 2026-11-21T09:01:00.000Z to today.today"
    )
    for (const event of sent) expect(checkEvent(event, PIPELINES).ok).toBe(true)
  })

  it("names the screen a closed one went to, if its place comes on in the same turn", () => {
    const { places: p, sent, end, also } = places()
    p.at("apply")
    p.at(null)
    expect(said(sent)).toEqual(["taken"])
    also({ pipeline: "jobs", affordance: "record", surface: "apk" }).at(
      "record"
    )
    expect(said(sent)).toEqual([
      "taken",
      "left apply since 2026-11-21T09:00:00.000Z to record.record",
      "taken",
    ])
    end()
    expect(sent).toHaveLength(3)
  })

  it("sends a closed screen's left with no next when nothing comes on that turn, or another pipeline's does", () => {
    const { places: p, sent, end, also } = places()
    p.at("apply")
    p.at(null)
    end()
    expect(said(sent)).toEqual([
      "taken",
      "left apply since 2026-11-21T09:00:00.000Z",
    ])
    p.at("read")
    p.at(null)
    also({ pipeline: "rust-rounds", affordance: "ticket", surface: "apk" }).at(
      "ticket-1"
    )
    end()
    expect(sent.filter((e) => e.kind === "left").at(-1)).not.toHaveProperty(
      "next"
    )
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
    const { places: p, sent, end } = places()
    const stop = watchPlaces(p, page)
    p.at("read")
    shown = "hidden"
    target.dispatchEvent(new Event("visibilitychange"))
    shown = "visible"
    target.dispatchEvent(new Event("visibilitychange"))
    stop()
    target.dispatchEvent(new Event("visibilitychange"))
    end()
    expect(sent.map((e) => e.kind)).toEqual(["taken", "left", "taken", "left"])
  })
})
