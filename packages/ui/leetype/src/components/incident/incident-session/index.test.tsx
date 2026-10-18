import { IncidentSession } from "@leetype/components/incident/incident-session"
import { AB_FIXTURES } from "@leetype/lib/leetype/session-file/__tests__/fixtures"
import { createSessionLogStore } from "@leetype/lib/leetype/session-log"
import type { ChoiceScreen } from "@leetype/types/session-file"
import { SessionFileSchema } from "@leetype/types/session-file"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const FILE = SessionFileSchema.parse(AB_FIXTURES[1]?.raw)

function choice(id: string): ChoiceScreen {
  const found = FILE.screens[id]
  if (found?.type !== "choice") throw new Error(`${id} is not a choice`)
  return found
}

function mount(): { log: ReturnType<typeof createSessionLogStore> } {
  const log = createSessionLogStore(memoryStorage())
  render(
    <IncidentSession
      fileName="t1-01"
      file={FILE}
      ports={{ log, now: () => 0, newId: () => crypto.randomUUID() }}
    />
  )
  return { log }
}

const ROUND = choice("s02")
const RIGHT = ROUND.options.find((option) => option.correct)
const WRONG = ROUND.options.find(
  (option) => option.correct === false && option.feedback !== undefined
)

describe("IncidentSession", () => {
  it("shows the job pinned and the options, and nothing of the answer before the pick", () => {
    mount()
    fireEvent.click(
      screen.getByRole("button", { name: /Start with incident 1/ })
    )
    if (ROUND.pinned) expect(screen.getByText(ROUND.pinned)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Not sure" })).toBeTruthy()
    expect(screen.queryByText(/^Holds:/)).toBeNull()
    expect(screen.queryByText(/Decided by/)).toBeNull()
  })

  it("after a wrong pick says only what it breaks, then places the reading", () => {
    const { log } = mount()
    fireEvent.click(
      screen.getByRole("button", { name: /Start with incident 1/ })
    )
    fireEvent.click(screen.getByRole("button", { name: WRONG?.label }))

    if (WRONG?.feedback) expect(screen.getByText(WRONG.feedback)).toBeTruthy()
    if (RIGHT?.feedback) expect(screen.queryByText(RIGHT.feedback)).toBeNull()
    expect(screen.queryByText(/^Holds:/)).toBeNull()

    fireEvent.click(
      screen.getByRole("button", { name: "Show the worked answer" })
    )
    expect(screen.getByText(/^Holds:/)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    expect(screen.getByText("A reading")).toBeTruthy()
    expect(screen.getByText("The full source")).toBeTruthy()
    expect(log.getSnapshot().log.map((event) => event.type)).toEqual([
      "started",
      "picked",
      "confirmation-taken",
      "placed",
      "parked",
    ])
  })

  it("offers the worked confirmation after a correct pick, then the pointer", () => {
    mount()
    fireEvent.click(
      screen.getByRole("button", { name: /Start with incident 1/ })
    )
    fireEvent.click(screen.getByRole("button", { name: RIGHT?.label }))
    expect(screen.getByText(/^Holds:/)).toBeTruthy()
    expect(
      screen.queryByRole("button", { name: "Show the worked answer" })
    ).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    expect(screen.getByText("If you want more")).toBeTruthy()
  })

  it("ends at a round boundary when the learner leaves, and hands back on Done", () => {
    const onEnd = vi.fn()
    render(
      <IncidentSession
        fileName="t1-01"
        file={FILE}
        ports={{ log: createSessionLogStore(memoryStorage()) }}
        onEnd={onEnd}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "End here" }))
    expect(screen.getByText("This session has ended.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(onEnd).toHaveBeenCalledWith("left")
  })
})
