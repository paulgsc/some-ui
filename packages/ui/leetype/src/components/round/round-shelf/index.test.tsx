import { createHash } from "node:crypto"
import { RoundSession } from "@leetype/components/round/round-session"
import { AUTHORED_ROUNDS } from "@leetype/lib/leetype/authored-rounds"
import type { PastedRoundStore } from "@leetype/lib/leetype/pasted-round"
import { serializeRound } from "@leetype/lib/leetype/round-export"
import type { ShelfItem, ShelfPort } from "@leetype/lib/leetype/shelf"
import type { Round } from "@leetype/types/authored-round"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const CORPUS = AUTHORED_ROUNDS[1]!
const MINE: Round = { ...AUTHORED_ROUNDS[0]!, id: "my-own-round" }

function memoryStore(initial: Round | null = null): PastedRoundStore {
  let held = initial
  return {
    get: (): Round | null => held,
    set: (round): void => {
      held = round
    },
    clear: (): void => {
      held = null
    },
  }
}

type FakeShelf = ShelfPort & { bodies: Map<string, string> }

/** The host's shelf, in memory: the server's rules, and a spy on each call. */
function fakeShelf(cap = 20, signedIn = true): FakeShelf {
  const bodies = new Map<string, string>()
  const refuse = (reason: string): Promise<never> =>
    Promise.reject(Object.assign(new Error(reason), { reason }))
  const item = (key: string): ShelfItem => ({
    key,
    // The server's content hash, which the keep compares against.
    contentHash: createHash("sha256")
      .update(bodies.get(key) ?? "")
      .digest("hex"),
    savedAt: "2026-09-29T00:00:00.000Z",
  })
  return {
    bodies,
    list: vi.fn(() =>
      Promise.resolve({ items: [...bodies.keys()].map(item), cap })
    ),
    read: vi.fn((key: string): Promise<unknown> => {
      const body = bodies.get(key)
      if (body === undefined) return Promise.reject(new Error("404"))
      const parsed: unknown = JSON.parse(body)
      return Promise.resolve(parsed)
    }),
    keep: vi.fn((key: string, body: string) => {
      if (!signedIn) return refuse("signed-out")
      const had = bodies.get(key)
      if (had === undefined && bodies.size >= cap) return refuse("full")
      bodies.set(key, body)
      return Promise.resolve({
        change:
          had === undefined
            ? ("kept" as const)
            : had === body
              ? ("unchanged" as const)
              : ("replaced" as const),
        item: item(key),
      })
    }),
    remove: vi.fn((key: string) => {
      bodies.delete(key)
      return Promise.resolve()
    }),
  }
}

const keepButton = (): HTMLElement | null =>
  screen.queryByRole("button", { name: /Keep on this account/ })

describe("the learner shelf in a round session (canon Rem. 7.3)", () => {
  it("offers nothing to keep, and no shelf, where the host has none", () => {
    render(
      <RoundSession
        rounds={[CORPUS]}
        sessionSeed={3}
        pastedStore={memoryStore(MINE)}
      />
    )
    expect(screen.getByText("Your round")).toBeInTheDocument()
    expect(keepButton()).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Make your own/ }))
    expect(
      screen.queryByRole("region", { name: "Your shelf" })
    ).not.toBeInTheDocument()
  })

  it("offers to keep only the learner's own round, never a corpus one", () => {
    const shelf = fakeShelf()
    render(
      <RoundSession
        rounds={[CORPUS]}
        sessionSeed={3}
        pastedStore={memoryStore()}
        shelf={shelf}
      />
    )
    expect(screen.getByText("Round 1")).toBeInTheDocument()
    expect(keepButton()).not.toBeInTheDocument()
    expect(shelf.list).not.toHaveBeenCalled()
  })

  it("keeps the learner's own round when asked, then replays it from the shelf", async () => {
    const shelf = fakeShelf()
    const store = memoryStore(MINE)
    const set = vi.spyOn(store, "set")
    const { unmount } = render(
      <RoundSession
        rounds={[CORPUS]}
        sessionSeed={3}
        pastedStore={store}
        shelf={shelf}
      />
    )
    // Nothing is written or listed until the learner asks.
    expect(shelf.keep).not.toHaveBeenCalled()
    expect(shelf.list).not.toHaveBeenCalled()

    fireEvent.click(keepButton()!)
    expect(await screen.findByText(/Kept on this account/)).toBeInTheDocument()
    expect(shelf.keep).toHaveBeenCalledTimes(1)
    expect(shelf.keep).toHaveBeenCalledWith(
      "my-own-round",
      serializeRound(MINE)
    )
    unmount()

    // Another device: nothing held for this tab, only the corpus to play.
    const fresh = memoryStore()
    const setFresh = vi.spyOn(fresh, "set")
    render(
      <RoundSession
        rounds={[CORPUS]}
        sessionSeed={3}
        pastedStore={fresh}
        shelf={shelf}
      />
    )
    expect(screen.getByText("Round 1")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Make your own/ }))
    const kept = await screen.findByRole("region", { name: "Your shelf" })
    expect(within(kept).getByText("1 / 20")).toBeInTheDocument()
    fireEvent.click(
      within(kept).getByRole("button", { name: "Play my-own-round" })
    )

    // It plays first, as a pasted round does, and is held for the session.
    expect(await screen.findByText("Your round")).toBeInTheDocument()
    expect(setFresh).toHaveBeenCalledTimes(1)
    expect(setFresh.mock.calls[0]?.[0].id).toBe("my-own-round")
    expect(set).not.toHaveBeenCalled()
    // Prop. 8.1: the shelf's capacity is not a count of rounds.
    expect(screen.queryByText(/Round \d+ (of|\/)/)).not.toBeInTheDocument()
  })

  it("asks again for a different own round that shares the kept one's id", async () => {
    // Review, #1600: the Keep control kept saying "Kept" for a second own
    // round with the first one's id, and that round was never kept.
    const shelf = fakeShelf()
    const other: Round = { ...AUTHORED_ROUNDS[2]!, id: "my-own-round" }
    shelf.bodies.set("elsewhere", serializeRound(other))
    render(
      <RoundSession
        rounds={[CORPUS]}
        sessionSeed={3}
        pastedStore={memoryStore(MINE)}
        shelf={shelf}
      />
    )
    fireEvent.click(keepButton()!)
    expect(await screen.findByText(/Kept on this account/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Make your own/ }))
    const kept = await screen.findByRole("region", { name: "Your shelf" })
    fireEvent.click(
      within(kept).getByRole("button", { name: "Play elsewhere" })
    )
    expect(await screen.findByText("Your round")).toBeInTheDocument()
    expect(keepButton()).toBeInTheDocument()
    expect(screen.queryByText(/Kept on this account/)).not.toBeInTheDocument()

    // Kept beside the first, never over it: the shelf holds both.
    fireEvent.click(keepButton()!)
    expect(
      await screen.findByText(/Kept on this account as my-own-round-2/)
    ).toBeInTheDocument()
    expect(shelf.bodies.get("my-own-round")).toBe(serializeRound(MINE))
    expect(shelf.bodies.get("my-own-round-2")).toBe(serializeRound(other))
  })

  it("says a full shelf is full, and removes only what the learner removes", async () => {
    const shelf = fakeShelf(1)
    shelf.bodies.set("older", "{}")
    render(
      <RoundSession
        rounds={[CORPUS]}
        sessionSeed={3}
        pastedStore={memoryStore(MINE)}
        shelf={shelf}
      />
    )
    fireEvent.click(keepButton()!)
    expect(await screen.findByText(/Your shelf is full/)).toBeInTheDocument()
    const kept = await screen.findByRole("region", { name: "Your shelf" })
    expect(within(kept).getByText("1 / 1")).toBeInTheDocument()
    expect(
      within(kept).queryByRole("button", { name: /^Play/ })
    ).not.toBeInTheDocument()
    expect(shelf.remove).not.toHaveBeenCalled()

    fireEvent.click(within(kept).getByRole("button", { name: "Remove older" }))
    expect(await within(kept).findByText("0 / 1")).toBeInTheDocument()
    expect(shelf.remove).toHaveBeenCalledWith("older")

    fireEvent.click(keepButton()!)
    expect(await screen.findByText(/Kept on this account/)).toBeInTheDocument()
    expect([...shelf.bodies.keys()]).toEqual(["my-own-round"])
  })

  it("shows a kept body that fails the round checks as unreadable, never played", async () => {
    const shelf = fakeShelf()
    shelf.bodies.set(
      "broken",
      JSON.stringify({ ...AUTHORED_ROUNDS[0]!, diffOptions: [] })
    )
    const store = memoryStore()
    const set = vi.spyOn(store, "set")
    render(
      <RoundSession
        rounds={[CORPUS]}
        sessionSeed={3}
        pastedStore={store}
        shelf={shelf}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /Make your own/ }))
    const kept = await screen.findByRole("region", { name: "Your shelf" })
    fireEvent.click(
      await within(kept).findByRole("button", { name: "Play broken" })
    )
    expect(await within(kept).findByText(/Can't be played/)).toBeInTheDocument()
    expect(
      within(kept).queryByRole("button", { name: "Play broken" })
    ).not.toBeInTheDocument()
    expect(
      within(kept).getByRole("button", { name: "Remove broken" })
    ).toBeInTheDocument()
    expect(set).not.toHaveBeenCalled()
  })

  it("asks a signed-out learner to sign in, rather than failing", async () => {
    render(
      <RoundSession
        rounds={[CORPUS]}
        sessionSeed={3}
        pastedStore={memoryStore(MINE)}
        shelf={fakeShelf(20, false)}
      />
    )
    fireEvent.click(keepButton()!)
    expect(await screen.findByText("Sign in to keep this.")).toBeInTheDocument()
    expect(keepButton()).not.toBeInTheDocument()
  })
})
