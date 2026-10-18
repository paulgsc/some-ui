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
  it("keeps a picked session file, says where to look, and lists what the phone holds", async () => {
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
        store={{ list, keep, read: () => Promise.resolve(null) }}
        hint="In Drive, look in LeetType › sessions"
      />
    )
    expect(
      screen.getByText("In Drive, look in LeetType › sessions")
    ).toBeTruthy()

    pick(
      screen.getByLabelText("Open a session from storage"),
      "t1-01.json",
      VALID
    )

    expect(
      await screen.findByText(`Kept ${RAW.title} on this phone.`)
    ).toBeTruthy()
    expect(keep).toHaveBeenCalledWith(
      expect.objectContaining({ name: "t1-01", body: VALID }),
      expect.any(Date)
    )
    expect(await screen.findByText("On this phone (1)")).toBeTruthy()
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
      />
    )
    pick(
      screen.getByLabelText("Open a session from storage"),
      "notes.json",
      "{}"
    )

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toMatch(/^notes isn't a session file\. /)
    expect(keep).not.toHaveBeenCalled()
  })
})
