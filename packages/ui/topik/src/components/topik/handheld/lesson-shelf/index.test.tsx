import { createHash } from "node:crypto"
import type { JSX } from "react"
import type { ShelfItem, ShelfPort } from "@some-ui/shared"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import { HandheldLesson } from "@topik/components/topik/handheld/handheld-lesson"
import {
  FIXTURE_BATCHES,
  fixtureMetadataRepository,
  fixtureTopikRepository,
} from "@topik/components/topik/handheld/handheld-lesson/fixture"
import type { TopikMetadata } from "@topik/lib/topik"
import { SessionConfigProvider } from "@topik/lib/topik/adapter/context/session-config-context"
import type { PastedLessonStore } from "@topik/lib/topik/adapter/pasted-lesson"
import {
  createPastedLessonStore,
  serializePastedLesson,
  serializePastedTree,
} from "@topik/lib/topik/adapter/pasted-lesson"
import { createResumeStore } from "@topik/lib/topik/adapter/resume-point"
import { createSurveyStore } from "@topik/lib/topik/adapter/survey-store"
import { workedLesson } from "@topik/lib/topik/generation/tree-intake/worked-example"
import { afterEach, describe, expect, it, vi } from "vitest"

const DINNER: TopikMetadata = {
  key: "local:first-dinner",
  displayName: "The first family dinner",
  description: "Seo-yeon meets Chairman Kang.",
  batchCount: FIXTURE_BATCHES.length,
  totalQuestions: 0,
  totalMessages: 0,
  tags: ["topik-2"],
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
      signedIn
        ? Promise.resolve({ items: [...bodies.keys()].map(item), cap })
        : refuse("signed-out")
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

function renderLesson(
  shelf: ShelfPort | undefined,
  pasted: PastedLessonStore = createPastedLessonStore(memoryStorage())
): void {
  const tree = (): JSX.Element => (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <SessionConfigProvider
        value={{
          topikRepository: fixtureTopikRepository,
          metadataRepository: fixtureMetadataRepository,
          speaker: null,
          ...(shelf ? { shelf } : {}),
        }}
      >
        <HandheldLesson
          resumeStore={createResumeStore(memoryStorage())}
          surveyStore={createSurveyStore(memoryStorage())}
          pastedStore={pasted}
          pastedResumeStore={createResumeStore(memoryStorage())}
        />
      </SessionConfigProvider>
    </QueryClientProvider>
  )
  render(tree())
}

const holding = (meta: TopikMetadata = DINNER): PastedLessonStore => {
  const store = createPastedLessonStore(memoryStorage())
  store.set(meta, FIXTURE_BATCHES)
  return store
}

const click = (name: string | RegExp): void => {
  fireEvent.click(screen.getByRole("button", { name }))
}

afterEach(cleanup)

describe("the learner shelf (canon Rem. 7.3)", () => {
  it("offers nothing to keep, and no shelf, where the host has none", async () => {
    renderLesson(undefined, holding())
    await screen.findByRole("region", { name: "Pasted this session" })
    expect(
      screen.queryByRole("button", { name: /Keep on this account/ })
    ).toBeNull()
    click(/Write your own lesson/)
    expect(screen.queryByRole("region", { name: "Your shelf" })).toBeNull()
  })

  it("keeps the pasted lesson only when asked, then replays it from the shelf", async () => {
    const shelf = fakeShelf()
    const pasted = holding()
    renderLesson(shelf, pasted)
    await screen.findByRole("region", { name: "Pasted this session" })
    // Nothing is written, listed or read until the learner asks.
    expect(shelf.keep).not.toHaveBeenCalled()
    expect(shelf.list).not.toHaveBeenCalled()

    click(/Keep on this account/)
    expect(await screen.findByText(/Kept on this account/)).toBeTruthy()
    // The key without its `local:` prefix; the body is the pasted slot's own
    // document, as the slot reads it back.
    const held = pasted.get()!
    expect(shelf.keep).toHaveBeenCalledTimes(1)
    expect(shelf.keep).toHaveBeenCalledWith(
      "first-dinner",
      serializePastedLesson(held.meta, held.batches)
    )

    // A new device, in effect: the tab's copy is gone.
    click("Forget The first family dinner")
    expect(pasted.get()).toBeNull()

    click(/Write your own lesson/)
    const kept = await screen.findByRole("region", { name: "Your shelf" })
    expect(within(kept).getByText("1 / 20")).toBeTruthy()
    fireEvent.click(
      within(kept).getByRole("button", { name: "Play first-dinner" })
    )

    expect(await screen.findByText("어서 오세요. 뭐 드릴까요?")).toBeTruthy()
    expect(
      screen.getByRole("heading", { name: "The first family dinner" })
    ).toBeTruthy()
    // It plays as the pasted lesson, held for the session like a paste.
    expect(pasted.get()?.meta.key).toBe("local:first-dinner")
    expect(shelf.read).toHaveBeenCalledWith("first-dinner")
  })

  it("keeps a pasted scene tree when asked, and replays it as the drama", async () => {
    const shelf = fakeShelf()
    const pasted = createPastedLessonStore(memoryStorage())
    pasted.setTree(workedLesson())
    renderLesson(shelf, pasted)
    await screen.findByRole("region", { name: "Pasted this session" })
    expect(shelf.keep).not.toHaveBeenCalled()

    click(/Keep on this account/)
    expect(await screen.findByText(/Kept on this account/)).toBeTruthy()
    // Under the tree's id, as the slot's own document.
    expect(shelf.keep).toHaveBeenCalledWith(
      "first-tea",
      serializePastedTree(workedLesson())
    )

    click("Forget this drama")
    expect(pasted.getTree()).toBeNull()
    click(/Write your own lesson/)
    const kept = await screen.findByRole("region", { name: "Your shelf" })
    fireEvent.click(
      within(kept).getByRole("button", { name: "Play first-tea" })
    )

    expect(await screen.findByText("숨 막히는 긴장감")).toBeTruthy()
    // It plays as the pasted tree, held for the session like a paste.
    expect(pasted.getTree()).toEqual(workedLesson())
  })

  it("says a full shelf is full, and removes only what the learner removes", async () => {
    const shelf = fakeShelf(2)
    shelf.bodies.set("older", "{}")
    shelf.bodies.set("oldest", "[]")
    renderLesson(shelf, holding())

    fireEvent.click(
      await screen.findByRole("button", { name: /Keep on this account/ })
    )
    expect(await screen.findByText(/Your shelf is full/)).toBeTruthy()
    const kept = await screen.findByRole("region", { name: "Your shelf" })
    expect(within(kept).getByText("2 / 2")).toBeTruthy()
    // Making room, not playing: no row is offered to play here.
    expect(within(kept).queryByRole("button", { name: /^Play/ })).toBeNull()
    expect(shelf.remove).not.toHaveBeenCalled()

    fireEvent.click(within(kept).getByRole("button", { name: "Remove older" }))
    expect(await within(kept).findByText("1 / 2")).toBeTruthy()
    expect(shelf.remove).toHaveBeenCalledTimes(1)
    expect(shelf.remove).toHaveBeenCalledWith("older")

    click(/Keep on this account/)
    expect(await screen.findByText(/Kept on this account/)).toBeTruthy()
    expect([...shelf.bodies.keys()]).toEqual(["oldest", "first-dinner"])
  })

  it("shows a kept body that fails the paste's check as unreadable, never played", async () => {
    const shelf = fakeShelf()
    shelf.bodies.set(
      "broken",
      JSON.stringify({ version: 1, meta: {}, batches: [{ id: "x" }] })
    )
    const pasted = createPastedLessonStore(memoryStorage())
    renderLesson(shelf, pasted)

    fireEvent.click(
      await screen.findByRole("button", { name: /Write your own lesson/ })
    )
    const kept = await screen.findByRole("region", { name: "Your shelf" })
    fireEvent.click(
      await within(kept).findByRole("button", { name: "Play broken" })
    )
    expect(await within(kept).findByText(/Can't be played/)).toBeTruthy()
    expect(
      within(kept).queryByRole("button", { name: "Play broken" })
    ).toBeNull()
    expect(
      within(kept).getByRole("button", { name: "Remove broken" })
    ).toBeTruthy()
    expect(pasted.get()).toBeNull()
    expect(screen.getByRole("heading", { name: "New lesson" })).toBeTruthy()
  })

  it("asks a signed-out learner to sign in, rather than failing", async () => {
    const shelf = fakeShelf(20, false)
    renderLesson(shelf, holding())
    fireEvent.click(
      await screen.findByRole("button", { name: /Keep on this account/ })
    )
    expect(await screen.findByText("Sign in to keep this.")).toBeTruthy()
    expect(
      screen.queryByRole("button", { name: /Keep on this account/ })
    ).toBeNull()
  })
})
