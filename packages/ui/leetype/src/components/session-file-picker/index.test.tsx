import { SessionFilePicker } from "@leetype/components/session-file-picker"
import type { SessionFileStore } from "@leetype/lib/leetype/session-file-pick"
import { AB_FIXTURES } from "@leetype/lib/leetype/session-file/__tests__/fixtures"
import { SessionFileSchema } from "@leetype/types/session-file"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const RAW = SessionFileSchema.parse(AB_FIXTURES[1]?.raw)
const VALID = JSON.stringify(AB_FIXTURES[1]?.raw)

/** What the picker hands over; jsdom's `File` cannot be read as text. */
function pick(input: HTMLElement, name: string, text: string): void {
  const file = {
    name,
    size: text.length,
    text: (): Promise<string> => Promise.resolve(text),
  }
  fireEvent.change(input, { target: { files: [file] } })
}

describe("SessionFilePicker", () => {
  it("keeps a picked session file, says where to look, and plays what the phone holds", async () => {
    const onPlay = vi.fn()
    const keep = vi.fn<SessionFileStore["keep"]>(() => Promise.resolve("kept"))
    const list = vi
      .fn<SessionFileStore["list"]>()
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        {
          name: "t1-01",
          title: RAW.title,
          oneLine: RAW.oneLine,
          pickedAt: "2026-10-18T21:00:00.000Z",
        },
      ])
    render(
      <SessionFilePicker
        store={{ list, keep, read: () => Promise.resolve(VALID) }}
        hint="In Drive, look in LeetType › sessions"
        onPlay={onPlay}
      />
    )
    expect(
      screen.getByText("In Drive, look in LeetType › sessions")
    ).toBeTruthy()

    pick(
      screen.getByLabelText("Add a session from storage"),
      "t1-01.json",
      VALID
    )

    expect(
      await screen.findByText(`Kept ${RAW.title} on this phone.`)
    ).toBeTruthy()
    fireEvent.click(
      await screen.findByRole("button", {
        name: new RegExp(`Play ${RAW.title}`),
      })
    )
    await vi.waitFor(() => {
      expect(onPlay).toHaveBeenCalledWith({ name: "t1-01", file: RAW })
    })
  })

  it("refuses a file that isn't a session file, saying why", async () => {
    const keep = vi.fn<SessionFileStore["keep"]>()
    render(
      <SessionFilePicker
        store={{
          list: () => Promise.resolve([]),
          keep,
          read: () => Promise.resolve(null),
        }}
        onPlay={vi.fn()}
      />
    )
    pick(
      screen.getByLabelText("Add a session from storage"),
      "notes.json",
      "{}"
    )

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toMatch(/^notes isn't a session file\. /)
    expect(keep).not.toHaveBeenCalled()
  })

  it("offers a viewer's samples to play and no way to pick, saying how long they last", async () => {
    const onPlay = vi.fn()
    render(
      <SessionFilePicker
        store={{
          list: () =>
            Promise.resolve([
              {
                name: "t1-01",
                title: RAW.title,
                oneLine: RAW.oneLine,
                pickedAt: "2026-10-01T09:00:00.000Z",
              },
            ]),
          keep: vi.fn<SessionFileStore["keep"]>(),
          read: () => Promise.resolve(VALID),
        }}
        samples
        onPlay={onPlay}
      />
    )
    expect(screen.queryByLabelText("Add a session from storage")).toBeNull()
    expect(screen.getByText(/lasts until you reload this page/)).toBeTruthy()
    expect(
      await screen.findByRole("list", { name: "Sample sessions" })
    ).toBeTruthy()
  })
})
