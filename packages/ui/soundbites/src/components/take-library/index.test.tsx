import type { Player } from "@some-ui/voice-capture"
import { TakeLibrary } from "@soundbites/components/take-library"
import type { LibraryRead, LibraryTake } from "@soundbites/lib/library/model"
import type { TakesHome } from "@soundbites/lib/library/runtime"
import { LIBRARY_WORDS } from "@soundbites/lib/library/words"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const W = LIBRARY_WORDS

const TAKE: LibraryTake = {
  id: "t1",
  ref: "week-8:intro:1",
  recordedAt: "2026-11-03T09:00:00.000Z",
  storedAt: "2026-11-03T09:01:00.000Z",
  size: 48_000,
  setAsideAt: null,
  heard: {
    text: "The brand comes first, then the week",
    language: "en",
    model: "ggml-base.en.bin",
    heardAt: "2026-11-03T09:02:00.000Z",
  },
}

const UNHEARD: LibraryTake = {
  ...TAKE,
  id: "t2",
  ref: "idea:i1:what",
  heard: null,
  setAsideAt: "2026-11-04T10:00:00.000Z",
}

const newest: LibraryRead = {
  kind: "read",
  page: { takes: [TAKE, UNHEARD], total: 2, matched: null, by: "newest" },
}

const quietPlayer: Player = {
  play: () => ({ ended: new Promise(() => undefined), stop: () => undefined }),
}

function home(more: Partial<TakesHome> = {}): TakesHome {
  return {
    takes: (q) =>
      Promise.resolve(
        q === null
          ? newest
          : {
              kind: "read",
              page: { takes: [TAKE], total: 2, matched: 1, by: "words" },
            }
      ),
    audio: () => Promise.resolve(new Blob(["take"])),
    ...more,
  }
}

const settle = (): Promise<void> => act(() => Promise.resolve())

describe("Takes on home (ST32)", () => {
  it("lists the takes home keeps with the words it heard, and says one it hasn't heard yet", async () => {
    render(<TakeLibrary ports={{ home: home(), player: quietPlayer }} />)
    await settle()
    expect(screen.getByText(TAKE.heard!.text)).toBeTruthy()
    expect(screen.getByText(W.notHeard)).toBeTruthy()
    expect(screen.getByText(W.shown("newest", null, 2, 2, null))).toBeTruthy()
    expect(screen.getByText(W.setAside(UNHEARD.setAsideAt!))).toBeTruthy()
  })

  it("searches the words, says the search ran on words, and goes back to the newest", async () => {
    const takes = vi.fn(home().takes)
    render(
      <TakeLibrary ports={{ home: home({ takes }), player: quietPlayer }} />
    )
    await settle()
    fireEvent.change(screen.getByLabelText(W.searchLabel), {
      target: { value: "brand" },
    })
    fireEvent.click(screen.getByRole("button", { name: W.search }))
    await settle()
    expect(takes).toHaveBeenLastCalledWith("brand", expect.any(Function))
    expect(screen.getByText(W.shown("words", "brand", 1, 2, 1))).toBeTruthy()
    expect(screen.queryByText(W.notHeard)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: W.newest }))
    await settle()
    expect(takes).toHaveBeenLastCalledWith(null, expect.any(Function))
    expect(screen.getByText(W.notHeard)).toBeTruthy()
  })

  it("says a search is too long, and asks home nothing for it", async () => {
    const takes = vi.fn(home().takes)
    render(
      <TakeLibrary ports={{ home: home({ takes }), player: quietPlayer }} />
    )
    await settle()
    fireEvent.change(screen.getByLabelText(W.searchLabel), {
      target: { value: "é".repeat(201) },
    })
    fireEvent.click(screen.getByRole("button", { name: W.search }))
    await settle()
    expect(screen.getByText(W.tooLong)).toBeTruthy()
    expect(takes).toHaveBeenCalledTimes(1)
  })

  it("plays a take from home, and says when home couldn't give it back", async () => {
    const play = vi.fn(quietPlayer.play)
    const audio = vi
      .fn<TakesHome["audio"]>()
      .mockResolvedValueOnce(new Blob(["take"]))
      .mockResolvedValueOnce(null)
    render(<TakeLibrary ports={{ home: home({ audio }), player: { play } }} />)
    await settle()
    const [first, second] = screen.getAllByRole("button", { name: W.play })
    fireEvent.click(first!)
    await settle()
    expect(audio).toHaveBeenCalledWith("t1")
    expect(play).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: W.stop })).toBeTruthy()
    fireEvent.click(second!)
    await settle()
    expect(audio).toHaveBeenCalledWith("t2")
    expect(screen.getByText(W.unplayable)).toBeTruthy()
  })

  it("says why there is nothing, offering Try again only where it can help", async () => {
    const takes = vi.fn(() => Promise.resolve({ kind: "away" as const }))
    const { unmount } = render(
      <TakeLibrary ports={{ home: home({ takes }), player: quietPlayer }} />
    )
    await settle()
    expect(screen.getByText(W.away)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: W.readAgain }))
    await settle()
    expect(takes).toHaveBeenCalledTimes(2)
    unmount()
    render(
      <TakeLibrary
        ports={{
          home: home({
            takes: () => Promise.resolve({ kind: "unpaired" }),
          }),
          player: quietPlayer,
        }}
      />
    )
    await settle()
    expect(screen.getByText(W.unpaired)).toBeTruthy()
    expect(screen.queryByRole("button", { name: W.readAgain })).toBeNull()
    expect(screen.queryByLabelText(W.searchLabel)).toBeNull()
  })
})
