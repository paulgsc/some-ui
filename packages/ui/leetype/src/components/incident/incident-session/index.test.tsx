import { IncidentSession } from "@leetype/components/incident/incident-session"
import { AB_FIXTURES } from "@leetype/lib/leetype/session-file/__tests__/fixtures"
import { createSessionLogStore } from "@leetype/lib/leetype/session-log"
import type { ChoiceScreen } from "@leetype/types/session-file"
import { SessionFileSchema } from "@leetype/types/session-file"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const FILE = SessionFileSchema.parse(AB_FIXTURES[1]?.raw)

function choice(id: string): ChoiceScreen {
  const found = FILE.screens[id]
  if (found?.type !== "choice") throw new Error(`${id} is not a choice`)
  return found
}

function mount(log = createSessionLogStore(memoryStorage())): {
  log: ReturnType<typeof createSessionLogStore>
} {
  render(
    <IncidentSession
      fileName="t1-01"
      file={FILE}
      ports={{ log, now: () => 0, newId: () => crypto.randomUUID() }}
    />
  )
  fireEvent.click(screen.getByRole("button", { name: /the whole session/ }))
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
    fireEvent.click(screen.getByRole("button", { name: /one incident/ }))
    fireEvent.click(screen.getByRole("button", { name: "End here" }))
    expect(screen.getByText("This session has ended.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(onEnd).toHaveBeenCalledWith("left")
  })

  it("first declares the length and says where the learner is, from the log", () => {
    render(
      <IncidentSession
        fileName="t1-01"
        file={FILE}
        ports={{ log: createSessionLogStore(memoryStorage()) }}
      />
    )
    expect(screen.getByText(FILE.title)).toBeTruthy()
    expect(
      screen.getByText("You haven't played this session yet.")
    ).toBeTruthy()
    expect(
      screen.getByRole("button", {
        name: "About 10 minutes: the whole session",
      })
    ).toBeTruthy()
    expect(
      screen.getByRole("button", {
        name: "About 5 minutes: one incident and the take",
      })
    ).toBeTruthy()
  })

  it("ends on a ledger made only of what the session recorded", () => {
    mount()
    fireEvent.click(
      screen.getByRole("button", { name: /Start with incident 1/ })
    )
    fireEvent.click(screen.getByRole("button", { name: WRONG?.label }))
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    fireEvent.click(screen.getByRole("button", { name: "End here" }))

    const ended = screen.getByRole("article")
    const items = [...ended.querySelectorAll("li")].map((li) => li.textContent)
    const round = ROUND.title ?? ROUND.pinned ?? "s02"
    expect(items).toEqual([
      round,
      expect.stringMatching(new RegExp(`^${round} waits on `)),
    ])
    expect(screen.queryByText("Saved for a Read session")).toBeNull()
    expect(screen.queryByText("Your take")).toBeNull()
  })

  it("offers a parked round back once its reading has been read", () => {
    const log = createSessionLogStore(memoryStorage())
    mount(log)
    fireEvent.click(
      screen.getByRole("button", { name: /Start with incident 1/ })
    )
    fireEvent.click(screen.getByRole("button", { name: WRONG?.label }))
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    fireEvent.click(screen.getByRole("button", { name: /Save it/ }))
    fireEvent.click(screen.getByRole("button", { name: "End here" }))
    cleanup()

    // Saved, not read: nothing comes back yet.
    render(<IncidentSession fileName="t1-01" file={FILE} ports={{ log }} />)
    expect(screen.queryByText(/with new numbers/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /the whole session/ }))
    fireEvent.click(
      screen.getByRole("button", { name: /Start with incident 1/ })
    )
    fireEvent.click(screen.getByRole("button", { name: WRONG?.label }))
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    fireEvent.click(screen.getByRole("button", { name: "Read now" }))
    // At the return, the learner leaves before answering it.
    fireEvent.click(screen.getByRole("button", { name: "End here" }))
    cleanup()

    render(<IncidentSession fileName="t1-01" file={FILE} ports={{ log }} />)
    expect(screen.getByText(/Last time you ended at/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /with new numbers/ }))
    const back = choice("s04")
    fireEvent.click(
      screen.getByRole("button", {
        name: back.options.find((option) => option.correct)?.label,
      })
    )
    expect(log.getSnapshot().log.at(-1)).toMatchObject({
      type: "returned",
      screen: "s02",
      variant: "s04",
      asked: false,
    })
  })

  it("takes a typed answer where there is no microphone, then its rubric, then goes on", () => {
    const log = createSessionLogStore(memoryStorage())
    render(<IncidentSession fileName="t1-01" file={FILE} ports={{ log }} />)
    fireEvent.click(screen.getByRole("button", { name: /one incident/ }))
    fireEvent.click(
      screen.getByRole("button", { name: /Start with incident 1/ })
    )
    fireEvent.click(screen.getByRole("button", { name: RIGHT?.label }))
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    fireEvent.click(screen.getByRole("button", { name: "Skip" }))
    fireEvent.click(screen.getByRole("button", { name: /^Incident 1/ }))

    const take = FILE.screens.s15
    if (take?.type !== "record") throw new Error("s15 is not a take")
    // The rubric is not shown before an answer (Ax. 9.2).
    expect(screen.queryByText(take.rubric[0] ?? "")).toBeNull()
    fireEvent.change(screen.getByLabelText("Your answer, typed"), {
      target: { value: "The OK came before a majority held it." },
    })
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    fireEvent.click(screen.getByLabelText(take.rubric[0] ?? ""))
    fireEvent.click(screen.getByLabelText(take.rubric[3] ?? ""))
    fireEvent.click(screen.getByRole("button", { name: "Done" }))

    expect(log.getSnapshot().log).toContainEqual(
      expect.objectContaining({
        type: "spoken",
        screen: "s15",
        answer: { as: "typed", ticks: [take.rubric[0], take.rubric[3]] },
      })
    )
    expect(screen.getByText("This session has ended.")).toBeTruthy()
  })
})
