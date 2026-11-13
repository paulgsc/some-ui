/**
 * @vitest-environment jsdom
 *
 * One take's place on Studio's conveyor (CONVEYOR2, `./take-conveyor`):
 * where it stands on the station strip, a move to each other station the
 * owner may set with what rides along, and what the move did said over the
 * screen.
 */
import { inMemoryStorage } from "@some-ui/core-utils"
import type { LibraryTake } from "@some-ui/soundbites"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { TakeConveyor } from "@/lib/take-conveyor/runtime"
import { createTakeConveyor } from "@/lib/take-conveyor/runtime"
import { TAKE_CONVEYOR_WORDS } from "@/lib/take-conveyor/words"
import { TakeSorting } from "@/components/studio/take-conveyor"

const W = TAKE_CONVEYOR_WORDS
const AT = "2026-11-13T09:15:00.000Z"

const TAKE: LibraryTake = {
  id: "t1",
  ref: "",
  recordedAt: AT,
  storedAt: AT,
  size: 1,
  setAsideAt: null,
  heard: null,
  station: "in-the-oven",
  stationAt: null,
  stationSeq: 0,
}

const conveyor = (): TakeConveyor =>
  createTakeConveyor({
    storage: inMemoryStorage(),
    newId: () => "m1",
    now: () => AT,
  })

const current = (): string | null =>
  within(screen.getByRole("list", { name: W.label }))
    .getAllByRole("listitem")
    .find((item) => item.getAttribute("aria-current") === "step")
    ?.textContent ?? null

afterEach(cleanup)

describe("a take on the conveyor (CONVEYOR2)", () => {
  it("stands In the oven, and offers every station but where it is and Picked up", () => {
    render(<TakeSorting take={TAKE} conveyor={conveyor()} />)
    expect(current()).toBe(W.stations["in-the-oven"])
    const offered = screen.getAllByRole("button").map((b) => b.textContent)
    expect(offered).toEqual([
      W.page.moveTo("cooking"),
      W.page.moveTo("ready-for-pickup"),
      W.page.can,
    ])
  })

  it("moves it to Ready for pickup with its labels and note, and says so", () => {
    const line = conveyor()
    const { rerender } = render(<TakeSorting take={TAKE} conveyor={line} />)
    fireEvent.change(screen.getByLabelText(W.page.labels), {
      target: { value: "keeper, brand" },
    })
    fireEvent.change(screen.getByLabelText(W.page.note), {
      target: { value: "for week 9" },
    })
    fireEvent.click(
      screen.getByRole("button", { name: W.page.moveTo("ready-for-pickup") })
    )
    expect(line.port.due()).toEqual([
      {
        move: "m1",
        take: "t1",
        from: "in-the-oven",
        to: "ready-for-pickup",
        at: AT,
        seq: 0,
        labels: ["keeper", "brand"],
        comment: "for week 9",
      },
    ])
    expect(screen.getByRole("status").textContent).toContain(
      W.page.moved("ready-for-pickup")
    )
    rerender(<TakeSorting take={TAKE} conveyor={line} />)
    expect(current()).toBe(W.stations["ready-for-pickup"])
    expect(screen.getByLabelText<HTMLInputElement>(W.page.labels).value).toBe(
      ""
    )
  })

  it("sets a canned take beside the line, kept", () => {
    render(
      <TakeSorting
        take={{ ...TAKE, station: "canned", stationAt: AT, stationSeq: 2 }}
        conveyor={conveyor()}
      />
    )
    expect(current()).toBeNull()
    expect(screen.getByText(W.means.canned)).toBeTruthy()
    expect(screen.queryByRole("button", { name: W.page.can })).toBeNull()
  })

  it("says why a move wasn't made, and moves nothing", () => {
    const line = conveyor()
    render(<TakeSorting take={TAKE} conveyor={line} />)
    fireEvent.change(screen.getByLabelText(W.page.note), {
      target: { value: "x".repeat(281) },
    })
    fireEvent.click(screen.getByRole("button", { name: W.page.can }))
    expect(screen.getByRole("status").textContent).toContain(W.refused.comment)
    expect(line.port.due()).toEqual([])
  })

  it("offers no move of a take that's been picked up, and nothing for an idea's answer", () => {
    const { container, rerender } = render(
      <TakeSorting
        take={{ ...TAKE, station: "picked-up", stationAt: AT, stationSeq: 3 }}
        conveyor={conveyor()}
      />
    )
    expect(current()).toBe(W.stations["picked-up"])
    expect(screen.queryAllByRole("button")).toEqual([])
    rerender(
      <TakeSorting take={{ ...TAKE, station: null }} conveyor={conveyor()} />
    )
    expect(container.textContent).toBe("")
  })
})
