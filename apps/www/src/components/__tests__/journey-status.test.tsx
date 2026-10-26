/**
 * @vitest-environment jsdom
 *
 * JB2's screen half (`lib/jobs/journey`): the title bar renders every state
 * of the union, and its pop-up says the state's words, draws its road and
 * lists every state, its own picked out, each drawn in a form no other
 * state of its set shares; the morning run's card (RUN1) lists its own set
 * the same way. How the pop-up closes, whether it
 * fits a phone's window and whether its colors read are a real browser's to
 * say (`tests/ui-fit/jobs-status-fit.spec.ts`).
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import type { Morning, MorningId } from "@/lib/jobs/morning"
import { MORNING_IDS, morningLabel, morningSaid } from "@/lib/jobs/morning"
import type { JourneyId } from "@/lib/journey"
import { journey, JOURNEY_IDS, journeySaid, stateTitle } from "@/lib/journey"
import { MorningCard } from "@/components/jobs/morning-card"
import { JourneyStatus } from "@/components/journey-status"

const NOW = new Date("2026-10-24T21:30:00Z")

beforeAll(() => {
  // Radix sizes its popper with ResizeObserver, which jsdom does not have.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  )
})

afterAll(() => {
  vi.unstubAllGlobals()
})

afterEach(cleanup)

const sample = (id: JourneyId): ReturnType<typeof journey> =>
  journey(id, { since: "2026-10-24T16:14:00Z", runDay: "2026-10-25" })

function show(id: JourneyId): HTMLElement {
  const { container } = render(
    <>
      <JourneyStatus
        title="Today’s decisions"
        journey={sample(id)}
        noun="them"
        now={NOW}
      />
      <button type="button">Elsewhere</button>
    </>
  )
  const bar = container.querySelector<HTMLElement>("[data-journey]")
  if (bar === null) throw new Error("no bar")
  return bar
}

/** Presses the icon, then lets Radix arm its outside-press watch. */
async function open(id: JourneyId): Promise<void> {
  fireEvent.click(icon(id))
  await act(() => new Promise((done) => setTimeout(done, 0)))
}

const icon = (id: JourneyId): HTMLElement =>
  screen.getByRole("button", {
    name: `${journeySaid(sample(id), "them", NOW).title}. Show where they are`,
  })

/** Each list line's icon as drawn, its colours left out, so only its form is compared. */
function forms(popup: HTMLElement): Array<string> {
  return [...popup.querySelectorAll("li")].map((li) => {
    const icon = li.querySelector("[data-sign]")?.cloneNode(true)
    if (!(icon instanceof Element)) throw new Error("a list line has no icon")
    for (const el of [icon, ...icon.querySelectorAll("*")])
      el.removeAttribute("class")
    return icon.outerHTML
  })
}

describe("JourneyStatus", () => {
  it.each(JOURNEY_IDS)(
    "wears %s: its icon, its words and its road",
    async (id) => {
      const bar = show(id)
      expect(bar.dataset["journey"]).toBe(id)
      expect(
        screen.getByRole("heading", { name: "Today’s decisions" })
      ).toBeTruthy()

      await open(id)
      const popup = screen.getByRole("dialog")
      const said = journeySaid(sample(id), "them", NOW)
      expect(popup.textContent).toContain(said.line)
      expect(popup.querySelector("[data-journey-track]")).not.toBeNull()
      const current = popup.querySelector('li[aria-current="true"]')
      expect(current?.textContent).toBe(stateTitle(id, "them"))
    }
  )

  it("lists every state in its pop-up", async () => {
    show("with-home")
    await open("with-home")
    const states = screen.getByRole("dialog").querySelectorAll("li")
    expect([...states].map((li) => li.textContent)).toEqual(
      JOURNEY_IDS.map((each) => stateTitle(each, "them"))
    )
  })

  it("draws every state in its pop-up, each in a form no other shares", async () => {
    show("with-home")
    await open("with-home")
    const drawn = forms(screen.getByRole("dialog"))
    expect(drawn).toHaveLength(JOURNEY_IDS.length)
    expect(new Set(drawn).size).toBe(drawn.length)
  })

  it("draws every state of the morning run, each in a form no other shares", async () => {
    const morning = (id: MorningId): Morning => ({
      id,
      picked: 2,
      undecided: 1,
      seen: 12,
      lookedAt: null,
      problem: null,
      unrecorded: false,
    })
    for (const id of MORNING_IDS) {
      render(<MorningCard morning={morning(id)} runs={[]} now={NOW} />)
      const said = morningSaid(morning(id), NOW)
      fireEvent.click(screen.getByRole("button", { name: morningLabel(said) }))
      await act(() => new Promise((done) => setTimeout(done, 0)))
      const popup = screen.getByRole("dialog")
      const drawn = forms(popup)
      expect(drawn).toHaveLength(MORNING_IDS.length)
      expect(new Set(drawn).size).toBe(drawn.length)
      // The bar wears the same form its own line shows.
      const bar = document.querySelector("[data-journey-chip]")
      expect(bar?.getAttribute("data-sign")).toBe(
        popup
          .querySelector('li[aria-current="true"] [data-sign]')
          ?.getAttribute("data-sign")
      )
      cleanup()
    }
  })

  it("shows no icon before anything was offered", () => {
    const { container } = render(
      <JourneyStatus title="Today’s decisions" journey={null} noun="them" />
    )
    expect(
      container.querySelector("[data-journey]")?.getAttribute("data-journey")
    ).toBe("none")
    expect(screen.queryByRole("button")).toBeNull()
  })
})
