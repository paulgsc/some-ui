/**
 * @vitest-environment jsdom
 *
 * My data's Korean word sets page (MD7, #2496) as the phone draws it, over
 * the phone's real store: each set with when it was added and first opened,
 * Archive on each in use, Bring back under "Archived", and what was done
 * said over the screen with a way back (HS1).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { WORD_SETS } from "@/lib/my-data/words"
import { DeviceMyDataWordSets } from "@/components/settings/device-my-data-word-sets"

const set = (id: string, openedAt: string | null): unknown => ({
  deck: {
    schemaVersion: 1,
    id,
    title: `Set ${id}`,
    words: [{ id: "juda", lemma: "주다", gloss: "give" }],
    lines: [
      {
        id: "give",
        level: 1,
        korean: "주세요.",
        english: "Please give it to me.",
        words: [{ wordId: "juda", surface: "주세요", stemEnd: 1 }],
      },
    ],
  },
  addedAt: "2026-10-01T00:00:00.000Z",
  openedAt,
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe("My data's Korean word sets page", () => {
  it("lists each set, archives one, and brings it back from the notice", async () => {
    localStorage.setItem(
      "topik:read-aloud-sets",
      JSON.stringify([set("a", "2026-10-02T00:00:00.000Z"), set("b", null)])
    )
    render(<DeviceMyDataWordSets />)

    expect(await screen.findByText("Set a")).toBeTruthy()
    expect(screen.getByText(WORD_SETS.inUse(2, 50))).toBeTruthy()
    expect(screen.getByText(WORD_SETS.longAgo)).toBeTruthy()

    fireEvent.click(
      screen.getByRole("button", { name: WORD_SETS.archiveName("Set a") })
    )
    expect((await screen.findByRole("status")).textContent).toContain(
      WORD_SETS.said.archived("Set a")
    )
    expect(screen.getByText(WORD_SETS.archivedTitle)).toBeTruthy()
    expect(screen.getByText(WORD_SETS.inUse(1, 50))).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: WORD_SETS.bringBack }))
    expect(screen.getByText(WORD_SETS.inUse(2, 50))).toBeTruthy()
    expect(screen.queryByText(WORD_SETS.archivedTitle)).toBeNull()
  })

  it("says so when the phone has no word sets", async () => {
    render(<DeviceMyDataWordSets />)
    expect(await screen.findByText(WORD_SETS.none)).toBeTruthy()
  })
})
