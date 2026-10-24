/**
 * @vitest-environment jsdom
 *
 * JB2's screen half (`lib/jobs/journey`): the themed title bar renders every
 * state of the union with its own theme and icon, and its pop-up says the
 * state's words, draws its road and lists every state, its own picked out.
 * The pop-up closes on a press elsewhere, on focus leaving it, and on
 * Escape. Whether it fits a phone's window is a real browser's to say
 * (`tests/ui-fit/jobs-status-fit.spec.ts`).
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

import type { JourneyId } from "@/lib/journey"
import {
  journey,
  JOURNEY_IDS,
  journeySaid,
  stateTitle,
  themeOf,
} from "@/lib/journey"
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

describe("JourneyStatus", () => {
  it.each(JOURNEY_IDS)(
    "wears %s: its theme, its icon and its words",
    async (id) => {
      const bar = show(id)
      expect(bar.dataset["journey"]).toBe(id)
      expect(bar.dataset["journeyTheme"]).toBe(themeOf(id))
      expect(
        screen.getByRole("heading", { name: "Today’s decisions" })
      ).toBeTruthy()

      await open(id)
      const popup = screen.getByRole("dialog")
      const said = journeySaid(sample(id), "them", NOW)
      expect(popup.textContent).toContain(said.line)
      expect(popup.querySelector("[data-journey-track]")).not.toBeNull()
      const states = popup.querySelectorAll("li")
      expect([...states].map((li) => li.textContent)).toEqual(
        JOURNEY_IDS.map((each) => stateTitle(each, "them"))
      )
      const current = popup.querySelector('li[aria-current="true"]')
      expect(current?.textContent).toBe(stateTitle(id, "them"))
    }
  )

  it("closes on a press elsewhere", async () => {
    show("with-home")
    await open("with-home")
    expect(screen.queryByRole("dialog")).not.toBeNull()
    fireEvent.pointerDown(screen.getByRole("button", { name: "Elsewhere" }))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("closes when focus leaves it", async () => {
    show("missed-run")
    await open("missed-run")
    expect(screen.queryByRole("dialog")).not.toBeNull()
    act(() => {
      screen.getByRole("button", { name: "Elsewhere" }).focus()
    })
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("closes on Escape", async () => {
    show("read")
    await open("read")
    expect(screen.queryByRole("dialog")).not.toBeNull()
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
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
