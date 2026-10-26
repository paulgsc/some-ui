import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import { RoutineStatus } from "@topik/components/topik/handheld/routine-status"
import type { HeldRuns } from "@topik/lib/topik/adapter/routine-runs"
import {
  ROUTINE_WORDS,
  routineView,
  SHAPE_ORDER,
  VOICE_ORDER,
} from "@topik/lib/topik/core/routine-status"
import { afterEach, describe, expect, it } from "vitest"

afterEach(cleanup)

const RAN = "2026-10-24T12:00:00.000Z"
const HELD: HeldRuns = {
  runs: [
    {
      name: "run-reflections-20261024T120000Z.json",
      startedAt: RAN,
      finishedAt: RAN,
      outcome: "partly",
      found: { reflections: 2, prompts: 0 },
      added: [],
      problems: [],
      voice: { waiting: 1, missed: 1, unread: false },
      nextBy: null,
    },
  ],
  lookedAt: RAN,
  since: RAN,
}

/** A mark as drawn: its tone and its labels left out, so only its form is compared. */
const form = (svg: Element | null): string => {
  const copy = svg?.cloneNode(true)
  if (!(copy instanceof Element)) throw new Error("a legend line has no mark")
  for (const name of ["class", "data-shape", "data-voice"])
    copy.removeAttribute(name)
  return copy.outerHTML
}

describe("RoutineStatus", () => {
  it("draws every state in the legend, each in a form no other shares", () => {
    const view = routineView(HELD, new Set(), new Date(RAN), "2026-10-24")
    render(<RoutineStatus view={view} held={HELD} today="2026-10-24" />)
    fireEvent.click(
      screen.getByRole("button", { name: ROUTINE_WORDS.open(view) })
    )
    const legend = screen.getByRole("region", { name: ROUTINE_WORDS.legend })
    const marks = within(legend)
      .getAllByRole("listitem")
      .map((item) => item.querySelector("svg"))
    expect(marks).toHaveLength(SHAPE_ORDER.length + VOICE_ORDER.length)
    const forms = marks.map(form)
    expect(new Set(forms).size).toBe(forms.length)
  })

  it("shows each voice state the last run reported beside its mark", () => {
    const view = routineView(HELD, new Set(), new Date(RAN), "2026-10-24")
    const { container } = render(
      <RoutineStatus view={view} held={HELD} today="2026-10-24" />
    )
    const shown = [...container.querySelectorAll("[data-voice]")].map((svg) =>
      svg.getAttribute("data-voice")
    )
    expect(shown).toEqual(["missed", "waiting"])
  })
})
