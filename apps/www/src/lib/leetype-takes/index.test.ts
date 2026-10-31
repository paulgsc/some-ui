/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import { leetypeTakesForExport, phoneSpokenTakes } from "@/lib/leetype-takes"

vi.mock("@some-ui/voice-capture", async (actual) => {
  const shelf = {
    put: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
    ids: (): Promise<Array<string>> => Promise.resolve([]),
    get: (): Promise<null> => Promise.resolve(null),
  }
  return {
    ...(await actual<object>()),
    savingShelf: (): object => ({
      shelf: () => shelf,
      saving: vi.fn(),
      isSaving: () => false,
    }),
    micRecorder: vi.fn(),
  }
})

const NOTE = {
  take: null,
  file: "t1-01",
  screen: "s15",
  prompt: "Tell it to a colleague.",
  rubric: ["one", "two"],
  ticks: ["one"],
  typed: "on the bus",
}

beforeEach(() => {
  localStorage.clear()
})

describe("phoneSpokenTakes", () => {
  it("keeps each answer's note for the export", async () => {
    phoneSpokenTakes().note(NOTE)
    const { notes } = await leetypeTakesForExport()
    expect(notes).toEqual([
      expect.objectContaining({ ...NOTE, id: expect.any(String) }),
    ])
  })

  it("refuses a note past forty and says it is full, evicting none", async () => {
    const takes = phoneSpokenTakes()
    for (let index = 0; index < 40; index++) {
      takes.note({ ...NOTE, typed: String(index) })
    }
    expect(takes.getSnapshot()).toMatchObject({ full: true, notesFull: true })
    takes.note({ ...NOTE, typed: "one too many" })
    const { notes } = await leetypeTakesForExport()
    expect(notes).toHaveLength(40)
    expect(notes.map(({ typed }) => typed)).not.toContain("one too many")
    expect(notes.map(({ typed }) => typed)).toContain("0")
  })

  it("gives the same snapshot until something changes", () => {
    const takes = phoneSpokenTakes()
    expect(takes.getSnapshot()).toBe(takes.getSnapshot())
    expect(takes.getSnapshot()).toMatchObject({
      recording: false,
      last: null,
      full: false,
      notesFull: false,
    })
  })
})
