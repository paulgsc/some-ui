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
import type { ShelfPorts } from "@soundbites/lib/idea/shelf-runtime"
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

function setup(
  ideas: ReadonlyArray<Idea>,
  ports: Partial<ShelfPorts> = {}
): {
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
        ...ports,
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
      studio={(project) => (
        <a href={`/journal?project=${project}`}>{W.openVideo}</a>
      )}
    />
  )
  return { projects, shared }
}

/** Lets the shelf's reads and writes land. */
const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
  })

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
  })

  it("shows Claude's scenes, then the video they became, linked to that video", async () => {
    const { projects, shared } = setup([caught()])
    fireEvent.click(await screen.findByRole("button", { name: /week 8/ }))
    fireEvent.click(screen.getByRole("button", { name: W.share }))
    expect(shared[0]).toMatch(/"what"/)
    await pick(replyText({ primer: DRAFT }))
    expect(screen.getByText(W.notice.replied)).toBeTruthy()
    expect(screen.getByText(W.scenes(2))).toBeTruthy()
    expect(screen.getByText(W.fromYou)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: W.make }))
    await settle()
    expect(screen.getByText(W.notice.made)).toBeTruthy()
    const [project] = [...projects.projects.keys()]
    expect(
      screen.getByRole("link", { name: W.openVideo }).getAttribute("href")
    ).toBe(`/journal?project=${String(project)}`)
    expect(screen.queryByRole("button", { name: W.make })).toBeNull()
  })

  it("lets a skipped question of Claude's be, and offers it again", async () => {
    setup([caught()])
    fireEvent.click(await screen.findByRole("button", { name: /week 8/ }))
    await pick(replyText({ primer: DRAFT, ask: ["Which week is it?"] }))
    expect(screen.queryByRole("button", { name: W.make })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: W.answer(1) }))
    await screen.findByText(W.askedOf(1, 1))
    fireEvent.click(
      screen.getByRole("button", { name: STUDIO_WORDS.idea.skip })
    )
    expect(screen.getByText(W.answeredSkipping(1))).toBeTruthy()
    expect(
      screen.getByRole("button", {
        name: STUDIO_WORDS.idea.answerSkipped(1),
      })
    ).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: W.backToIdea }))
    expect(screen.getByRole("button", { name: W.make })).toBeTruthy()
    expect(screen.queryByRole("button", { name: W.answer(1) })).toBeNull()
    expect(
      screen.getByRole("button", {
        name: STUDIO_WORDS.idea.answerSkipped(1),
      })
    ).toBeTruthy()
  })

  it("says so in place of Make when the phone's videos can't be read, and reads them again", async () => {
    let reads = 0
    const memory = memoryProjectStore()
    setup([caught()], {
      projects: {
        update: (id, change) => memory.store.update(id, change),
        list: () =>
          reads++ === 0
            ? Promise.reject(new Error("unread"))
            : memory.store.list(),
      },
    })
    fireEvent.click(await screen.findByRole("button", { name: /week 8/ }))
    await pick(replyText({ primer: DRAFT }))
    expect(screen.getByRole("alert").textContent).toContain(W.videosUnread)
    expect(screen.queryByRole("button", { name: W.make })).toBeNull()
    fireEvent.click(
      screen.getByRole("button", { name: STUDIO_WORDS.readAgain })
    )
    await settle()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByRole("button", { name: W.make })).toBeTruthy()
  })

  it("says it's kept already when the same reply is picked again", async () => {
    setup([caught()])
    fireEvent.click(await screen.findByRole("button", { name: /week 8/ }))
    await pick(replyText({ primer: DRAFT }))
    await pick(replyText({ primer: DRAFT }))
    expect(screen.getByText(W.notice.alreadyKept)).toBeTruthy()
    expect(screen.getAllByText(W.scenes(2))).toHaveLength(1)
  })

  it("answers Claude's questions the way the idea was caught", async () => {
    setup([caught()])
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
    fireEvent.click(screen.getByRole("button", { name: W.backToIdea }))
    expect(screen.getByText(W.shareAgainLine)).toBeTruthy()
  })

  it("shows an idea set aside as set aside, with the way back", async () => {
    setup([caught()])
    fireEvent.click(await screen.findByRole("button", { name: /week 8/ }))
    fireEvent.click(screen.getByRole("button", { name: W.setAside }))
    expect(screen.getByText(W.notice.aside)).toBeTruthy()
    expect(screen.getByText(W.setAsideLine)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: W.bringBack }))
    expect(screen.getByText(W.notice.back)).toBeTruthy()
    expect(screen.queryByRole("button", { name: W.bringBack })).toBeNull()
  })
})
