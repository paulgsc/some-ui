import { RecordScreenView } from "@leetype/components/incident/record-screen"
import { AB_FIXTURES } from "@leetype/lib/leetype/session-file/__tests__/fixtures"
import type { SpokenTakeSnapshot } from "@leetype/lib/leetype/spoken-take"
import { SessionFileSchema } from "@leetype/types/session-file"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const FILE = SessionFileSchema.parse(AB_FIXTURES[1]?.raw)
const TAKE = FILE.screens.s15

function mount(take: SpokenTakeSnapshot): { onTyped: () => void } {
  if (TAKE?.type !== "record") throw new Error("s15 is not a take")
  const onTyped = vi.fn()
  render(
    <RecordScreenView
      screen={TAKE}
      glossary={{}}
      spoken={null}
      take={take}
      onRecordStart={vi.fn()}
      onRecordStop={vi.fn()}
      onTyped={onTyped}
      onPass={vi.fn()}
      onTicked={vi.fn()}
    />
  )
  fireEvent.click(screen.getByRole("button", { name: "Type it instead" }))
  fireEvent.change(screen.getByLabelText("Your answer, typed"), {
    target: { value: "A majority never held it." },
  })
  return { onTyped }
}

const ROOM = { recording: false, said: null, last: null }

describe("RecordScreenView", () => {
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
