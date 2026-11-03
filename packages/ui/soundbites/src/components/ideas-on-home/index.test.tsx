import { IdeasOnHome } from "@soundbites/components/ideas-on-home"
import type { HomeIdea, HomeLists } from "@soundbites/lib/idea/on-home"
import type { IdeasHome } from "@soundbites/lib/idea/on-home-runtime"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const W = STUDIO_WORDS.onHome
const L = STUDIO_WORDS.lists

const IDEA: HomeIdea = {
  id: "i1",
  createdAt: "2026-11-01T09:00:00.000Z",
  revision: 1,
  sentAt: "2026-11-01T09:10:00.000Z",
  title: "Why the mic clips",
  topic: "Studio",
  format: "short",
  keywords: ["voice"],
  questions: 1,
  answers: [
    {
      question: "what",
      note: "t1",
      typed: null,
      heard: {
        text: "The mic clips when I shout",
        heardAt: "2026-11-01T09:12:00.000Z",
      },
      setAside: false,
    },
    {
      question: "takeaway",
      note: null,
      typed: "Keep the phone a hand away.",
      heard: null,
      setAside: false,
    },
  ],
  furnishing: false,
  setAside: false,
}

const LISTS: HomeLists = { topics: ["Studio"], keywords: ["voice"] }

function home(more: Partial<IdeasHome> = {}): IdeasHome {
  return {
    ideas: () =>
      Promise.resolve({
        kind: "read",
        value: { ideas: [IDEA], more: false },
      }),
    lists: () => Promise.resolve({ kind: "read", value: LISTS }),
    furnish: (_id, furnishing) =>
      Promise.resolve({ kind: "written", value: furnishing }),
    setAside: () => Promise.resolve({ kind: "written", value: null }),
    entry: (list, name, listed) =>
      Promise.resolve({
        kind: "written",
        value: {
          ...LISTS,
          [list]: listed
            ? [...LISTS[list], name]
            : LISTS[list].filter((each) => each !== name),
        },
      }),
    ...more,
  }
}

const settle = (): Promise<void> => act(() => Promise.resolve())

describe("Ideas on home (ST26 c)", () => {
  it("lists home's ideas by subject, opens one with home's words, and marks it still furnishing", async () => {
    const furnish = vi.fn(home().furnish)
    render(<IdeasOnHome home={home({ furnish })} />)
    await settle()
    expect(screen.getByRole("heading", { name: /Studio/ })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /Why the mic clips/ }))
    expect(screen.getByText("The mic clips when I shout")).toBeTruthy()
    expect(screen.getByText("Keep the phone a hand away.")).toBeTruthy()
    // The said answer's take isn't on this phone's desk.
    expect(screen.getByText(W.onlyOnHome)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: W.furnish }))
    await settle()
    expect(furnish).toHaveBeenCalledWith("i1", true)
    expect(screen.getByRole("button", { name: W.furnishing })).toBeTruthy()
    expect(screen.getByText(W.notice.furnishing)).toBeTruthy()
  })

  it("groups by keyword and sorts by title when asked", async () => {
    render(<IdeasOnHome home={home()} />)
    await settle()
    fireEvent.click(screen.getByRole("button", { name: W.groups.keyword }))
    expect(screen.getByRole("heading", { name: /voice/ })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: W.sorts.title }))
    expect(
      screen
        .getByRole("button", { name: W.sorts.title })
        .getAttribute("aria-pressed")
    ).toBe("true")
  })

  it("says why there is nothing when home can't be reached, and asks again on Try again", async () => {
    const ideas = vi.fn(() => Promise.resolve({ kind: "away" as const }))
    render(<IdeasOnHome home={home({ ideas })} />)
    await settle()
    expect(screen.getByText(W.away)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: W.readAgain }))
    await settle()
    expect(ideas).toHaveBeenCalledTimes(2)
  })

  it("edits the lists: adds an entry home takes, and takes one off", async () => {
    const entry = vi.fn(home().entry)
    render(<IdeasOnHome home={home({ entry })} initialLists />)
    await settle()
    fireEvent.change(screen.getByLabelText(L.newKeyword), {
      target: { value: "phone" },
    })
    fireEvent.click(screen.getAllByRole("button", { name: L.add })[1]!)
    await settle()
    expect(entry).toHaveBeenCalledWith("keywords", "phone", true)
    expect(screen.getByText("phone")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: L.remove("Studio") }))
    await settle()
    expect(entry).toHaveBeenCalledWith("topics", "Studio", false)
  })
})
