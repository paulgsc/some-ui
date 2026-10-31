import { inMemoryStorage } from "@some-ui/core-utils"
import { IdeaShelf } from "@soundbites/components/idea-shelf"
import {
  AT,
  caught,
  DRAFT,
  LATER,
  replyText,
} from "@soundbites/lib/idea/__tests__/fixture"
import type { Idea } from "@soundbites/lib/idea/model"
import { withAside } from "@soundbites/lib/idea/model"
import { NO_LISTENER } from "@soundbites/lib/idea/runtime"
import { keptIdeaStore } from "@soundbites/lib/idea/store"
import { memoryProjectStore } from "@soundbites/lib/studio/__tests__/fixture"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

const W = STUDIO_WORDS.shelf

/** jsdom's files have no `text()`: read them as the phone's WebView would. */
const readText = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (): void => resolve(String(reader.result))
    reader.onerror = (): void => reject(new Error("unread"))
    reader.readAsText(file)
  })

function setup(ideas: ReadonlyArray<Idea>): {
  store: ReturnType<typeof keptIdeaStore>
  projects: ReturnType<typeof memoryProjectStore>
  shared: Array<string>
} {
  const storage = inMemoryStorage()
  const store = keptIdeaStore(() => storage)
  store.keep(() => ideas)
  const projects = memoryProjectStore()
  const shared: Array<string> = []
  render(
    <IdeaShelf
      ports={{
        ideas: store,
        projects: projects.store,
        now: () => Date.parse(AT),
        readText,
      }}
      capture={{
        listener: NO_LISTENER,
        // Answered later than Claude asked.
        now: () => Date.parse(LATER),
        newId: () => "unused",
        onVisibility: () => (): void => undefined,
      }}
      share={({ file }) => (
        <button type="button" onClick={() => shared.push(file.data)}>
          {W.share}
        </button>
      )}
      studio={<a href="/journal">{W.openVideo}</a>}
    />
  )
  return { store, projects, shared }
}

/** Picks `text` as what Claude sent, and lets its read land. */
async function pick(text: string): Promise<void> {
  const input = screen.getByLabelText(W.openReply, { exact: false })
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File([text], "r")] } })
    await new Promise((resolve) => {
      setTimeout(resolve, 20)
    })
  })
}

describe("IdeaShelf", () => {
  it("shows each idea's first answer and where it is, and opens one", async () => {
    setup([caught("a"), withAside(caught("b"), true, AT)])
    const open = await screen.findByRole("button", {
      name: /a short about the week 8 picks/,
    })
    expect(screen.getByText(W.stage.idea)).toBeTruthy()
    expect(screen.getByRole("button", { name: W.asideCount(1) })).toBeTruthy()
    fireEvent.click(open)
    expect(screen.getByText("the model called Detroit")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: W.share }))
  })

  it("takes Claude's scenes, makes the video once, and says where it is", async () => {
    const { store, projects, shared } = setup([caught()])
    fireEvent.click(await screen.findByRole("button", { name: /week 8/ }))
    fireEvent.click(screen.getByRole("button", { name: W.share }))
    expect(shared[0]).toMatch(/"what"/)
    await pick(replyText({ primer: DRAFT }))
    expect(screen.getByText(W.notice.replied)).toBeTruthy()
    expect(screen.getByText(W.scenes(2))).toBeTruthy()
    expect(screen.getByText(W.fromYou)).toBeTruthy()
    expect(store.list()?.[0]?.drafts).toHaveLength(1)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: W.make }))
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
    })
    expect(projects.projects.size).toBe(1)
    expect(screen.getByText(W.notice.made)).toBeTruthy()
    expect(screen.getByRole("link", { name: W.openVideo })).toBeTruthy()
    expect(screen.queryByRole("button", { name: W.make })).toBeNull()
  })

  it("answers Claude's questions the way the idea was caught", async () => {
    const { store } = setup([caught()])
    fireEvent.click(await screen.findByRole("button", { name: /week 8/ }))
    await pick(replyText({ ask: ["Which week is it?"] }))
    fireEvent.click(screen.getByRole("button", { name: W.answer(1) }))
    const box = await screen.findByRole("textbox", {
      name: "Which week is it?",
    })
    expect(screen.getByText(W.askedOf(1, 1))).toBeTruthy()
    fireEvent.change(box, { target: { value: "week 8" } })
    fireEvent.click(
      screen.getByRole("button", { name: STUDIO_WORDS.idea.keepWords })
    )
    expect(screen.getByText(W.answered)).toBeTruthy()
    expect(store.list()?.[0]?.answers.at(-1)?.question).toBe("ask-1")
    fireEvent.click(screen.getByRole("button", { name: W.backToIdea }))
    expect(screen.getByText(W.shareAgainLine)).toBeTruthy()
  })

  it("sets an idea aside, kept, and brings it back", async () => {
    const { store } = setup([caught()])
    fireEvent.click(await screen.findByRole("button", { name: /week 8/ }))
    fireEvent.click(screen.getByRole("button", { name: W.setAside }))
    expect(screen.getByText(W.notice.aside)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: W.bringBack }))
    expect(store.list()?.[0]?.shelved?.map((each) => each.aside)).toEqual([
      true,
      false,
    ])
  })
})
