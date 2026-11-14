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

/** A conveyor whose moves are numbered m1, m2, … */
const conveyor = (): TakeConveyor => {
  let made = 0
  return createTakeConveyor({
    storage: inMemoryStorage(),
    newId: () => `m${String((made += 1))}`,
    now: () => AT,
  })
}

const current = (): string | null =>
  within(screen.getByRole("list", { name: W.label }))
    .getAllByRole("listitem")
    .find((item) => item.getAttribute("aria-current") === "step")
    ?.textContent ?? null

afterEach(cleanup)

/** Each station's button, in its fixed place, and whether it may be tapped. */
const buttons = (): ReadonlyArray<readonly [string | null, boolean]> =>
  screen
    .getAllByRole("button")
    .filter((b) => b.closest('[role="status"]') === null)
    .map((b) => [b.textContent, !b.hasAttribute("disabled")] as const)

/** A storage that keeps nothing: every write throws. */
const full = {
  getItem: (): null => null,
  setItem: (): void => {
    throw new Error("full")
  },
  removeItem: (): void => undefined,
}

describe("a take on the conveyor (CONVEYOR2)", () => {
  it("stands In the oven, and offers every station but where it is and Picked up", () => {
    render(<TakeSorting take={TAKE} conveyor={conveyor()} />)
    expect(current()).toBe(W.stations["in-the-oven"])
    expect(buttons()).toEqual([
      [W.page.moveTo("cooking"), true],
      [W.page.moveTo("ready-for-pickup"), true],
      [W.page.can, true],
    ])
  })

  it("moves it to Ready for pickup with its labels and note, says so until home takes it, and moves on from there", () => {
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
    expect(current()).toBe(W.stations["ready-for-pickup"])
    // The buttons hold their places; the one it's at can't be tapped.
    expect(buttons()).toEqual([
      [W.page.moveTo("cooking"), true],
      [W.page.moveTo("ready-for-pickup"), false],
      [W.page.can, true],
    ])
    expect(screen.getByLabelText<HTMLInputElement>(W.page.labels).value).toBe(
      ""
    )
    expect(screen.getByLabelText<HTMLInputElement>(W.page.note).value).toBe("")

    // Home takes it: the row says where it is, and the notice goes.
    line.port.answered("m1", { kind: "held" })
    rerender(<TakeSorting take={TAKE} conveyor={line} />)
    expect(screen.queryByRole("status")).toBeNull()

    // The next move is made from where it is now, by its number.
    fireEvent.click(
      screen.getByRole("button", { name: W.page.moveTo("cooking") })
    )
    expect(line.port.due()).toEqual([
      expect.objectContaining({
        from: "ready-for-pickup",
        to: "cooking",
        seq: 1,
      }),
    ])
  })

  it("sets a canned take beside the line, kept, and offers it back", () => {
    render(
      <TakeSorting
        take={{ ...TAKE, station: "canned", stationAt: AT, stationSeq: 2 }}
        conveyor={conveyor()}
      />
    )
    expect(current()).toBeNull()
    expect(screen.getByText(W.means.canned)).toBeTruthy()
    expect(buttons()).toEqual([
      [W.page.moveTo("cooking"), true],
      [W.page.moveTo("ready-for-pickup"), true],
      [W.page.can, false],
    ])
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

  it("says so when this phone can't keep a move, and the take stays where it was", () => {
    const line = createTakeConveyor({
      storage: full,
      newId: () => "m1",
      now: () => AT,
    })
    render(<TakeSorting take={TAKE} conveyor={line} />)
    fireEvent.click(screen.getByRole("button", { name: W.page.can }))
    expect(screen.getByRole("status").textContent).toContain(W.unkept)
    expect(current()).toBe(W.stations["in-the-oven"])
  })

  it("offers nothing to move or type for a take that's been picked up", () => {
    render(
      <TakeSorting
        take={{ ...TAKE, station: "picked-up", stationAt: AT, stationSeq: 3 }}
        conveyor={conveyor()}
      />
    )
    expect(current()).toBe(W.stations["picked-up"])
    expect(screen.queryAllByRole("button")).toEqual([])
    expect(screen.queryAllByRole("textbox")).toEqual([])
  })

  it("offers no move where home names no station, even one this phone moved before", () => {
    const line = conveyor()
    const { container, rerender } = render(
      <TakeSorting take={{ ...TAKE, station: null }} conveyor={line} />
    )
    expect(container.textContent).toBe("")
    // Moved on this phone while home named a station, then a home that names none.
    rerender(<TakeSorting take={TAKE} conveyor={line} />)
    fireEvent.click(screen.getByRole("button", { name: W.page.can }))
    const { station: _gone, ...unnamed } = TAKE
    rerender(<TakeSorting take={unnamed} conveyor={line} />)
    expect(container.textContent).toBe("")
  })
})
