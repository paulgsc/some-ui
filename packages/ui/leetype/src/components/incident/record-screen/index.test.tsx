import { RecordScreenView } from "@leetype/components/incident/record-screen"
import { AB_FIXTURES } from "@leetype/lib/leetype/session-file/__tests__/fixtures"
import type { SpokenTakeSnapshot } from "@leetype/lib/leetype/spoken-take"
import { SessionFileSchema } from "@leetype/types/session-file"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const FILE = SessionFileSchema.parse(AB_FIXTURES[1]?.raw)
const TAKE = FILE.screens.s15

function renderView(take: SpokenTakeSnapshot): {
  onTyped: () => void
  onRecordStart: () => void
  onRecordStop: () => void
} {
  if (TAKE?.type !== "record") throw new Error("s15 is not a take")
  const onTyped = vi.fn()
  const onRecordStart = vi.fn()
  const onRecordStop = vi.fn()
  render(
    <RecordScreenView
      screen={TAKE}
      glossary={{}}
      spoken={null}
      take={take}
      onRecordStart={onRecordStart}
      onRecordStop={onRecordStop}
      onTyped={onTyped}
      onPass={vi.fn()}
      onTicked={vi.fn()}
    />
  )
  return { onTyped, onRecordStart, onRecordStop }
}

function mount(take: SpokenTakeSnapshot): { onTyped: () => void } {
  const { onTyped } = renderView(take)
  fireEvent.click(screen.getByRole("button", { name: "Type it instead" }))
  fireEvent.change(screen.getByLabelText("Your answer, typed"), {
    target: { value: "A majority never held it." },
  })
  return { onTyped }
}

const ROOM = { recording: false, said: null, last: null }

describe("RecordScreenView", () => {
  it("records while held: pressed, then let go, lifted or slid off", () => {
    const idle = renderView({ ...ROOM, full: false, notesFull: false })
    const hold = screen.getByRole("button", { name: "Hold to record" })
    fireEvent.pointerDown(hold)
    expect(idle.onRecordStart).toHaveBeenCalledOnce()
    // At rest, a finger sliding off stops nothing.
    fireEvent.pointerLeave(hold)
    expect(idle.onRecordStop).not.toHaveBeenCalled()
    fireEvent.pointerUp(hold)
    expect(idle.onRecordStop).toHaveBeenCalledOnce()
  })

  it("holds from a keyboard once, however long the key repeats", () => {
    const { onRecordStart, onRecordStop } = renderView({
      ...ROOM,
      full: false,
      notesFull: false,
    })
    const hold = screen.getByRole("button", { name: "Hold to record" })
    fireEvent.keyDown(hold, { key: " " })
    fireEvent.keyDown(hold, { key: " ", repeat: true })
    fireEvent.keyUp(hold, { key: " " })
    expect(onRecordStart).toHaveBeenCalledOnce()
    expect(onRecordStop).toHaveBeenCalledOnce()
  })

  it("still takes a typed answer when only the recordings are full", () => {
    const { onTyped } = mount({ ...ROOM, full: true, notesFull: false })
    expect(screen.getByText(/You can still type one/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(onTyped).toHaveBeenCalledWith("A majority never held it.")
  })

  it("takes no answer at all once the notes are full", () => {
    mount({ ...ROOM, full: true, notesFull: true })
    expect(screen.getByRole("button", { name: "Done" })).toHaveProperty(
      "disabled",
      true
    )
  })
})
