import type { JSX } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ITopikRepository } from "@topik/lib/topik"
import { SessionConfigProvider } from "@topik/lib/topik/adapter/context/session-config-context"
import type { StorageLike } from "@topik/lib/topik/adapter/resume-point"
import { createResumeStore } from "@topik/lib/topik/adapter/resume-point"
import { afterEach, describe, expect, it } from "vitest"

import { HandheldLesson } from "."
import {
  FIXTURE_BATCHES,
  FIXTURE_TOPIK_KEY,
  fixtureMetadataRepository,
  fixtureTopikRepository,
} from "./fixture"

const memoryStorage = (): StorageLike => {
  const map = new Map<string, string>()
  return {
    getItem: (key: string): string | null => map.get(key) ?? null,
    setItem: (key: string, value: string): void => void map.set(key, value),
  }
}

function renderLesson(
  storage = memoryStorage(),
  topikRepository: ITopikRepository = fixtureTopikRepository
): ReturnType<typeof createResumeStore> {
  const store = createResumeStore(storage)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const tree = (): JSX.Element => (
    <QueryClientProvider client={client}>
      <SessionConfigProvider
        value={{
          topikRepository,
          metadataRepository: fixtureMetadataRepository,
          // No voice: the ladder starts at Hangul (canon Def. 9.3).
          speechAdapter: null,
        }}
      >
        <HandheldLesson resumeStore={store} />
      </SessionConfigProvider>
    </QueryClientProvider>
  )
  render(tree())
  return store
}

const click = (name: string | RegExp): void => {
  fireEvent.click(screen.getByRole("button", { name }))
}

afterEach(cleanup)

describe("HandheldLesson", () => {
  it("walks a line, then the check anchored to it, with the gloss withheld until answered", async () => {
    renderLesson()
    fireEvent.click(
      await screen.findByRole("button", { name: /Ordering at a café/ })
    )

    expect(await screen.findByText("어서 오세요. 뭐 드릴까요?")).toBeTruthy()
    // This line anchors no check, so its gloss is available.
    click(/Show English/)
    expect(screen.getByText("Welcome. What can I get you?")).toBeTruthy()

    click(/^Next/)
    expect(screen.getByText("아이스 아메리카노 한 잔 주세요.")).toBeTruthy()
    // This one anchors the order question: no English until it is answered.
    expect(screen.queryByRole("button", { name: /Show English/ })).toBeNull()
    expect(screen.getByText(/English unlocks after the question/)).toBeTruthy()

    click(/^Next/)
    expect(screen.getByText("What did the customer order?")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Check" })).toHaveProperty(
      "disabled",
      true
    )

    fireEvent.click(screen.getByRole("radio", { name: "One iced americano" }))
    click("Check")
    expect(screen.getByText("Understood")).toBeTruthy()
    // The anchor line's gloss, now unlocked.
    expect(screen.getByText("One iced americano, please.")).toBeTruthy()
  })

  it("assembles a typed answer from tiles, and brings a miss back after the last line", async () => {
    renderLesson()
    fireEvent.click(
      await screen.findByRole("button", { name: /Ordering at a café/ })
    )
    await screen.findByText("어서 오세요. 뭐 드릴까요?")

    click(/^Next/) // line 2
    click(/^Next/) // order check
    fireEvent.click(screen.getByRole("radio", { name: "A cake" }))
    click("Check")
    expect(screen.getByText(/comes back once more/)).toBeTruthy()
    click(/Continue/)

    click(/^Next/) // line 3 -> line 4
    click(/^Next/) // line 4 -> its tile check
    expect(
      screen.getByText("Build how the customer asked for it to go.")
    ).toBeTruthy()

    const pool = document.querySelector("[data-slot='topik-tile-pool']")!
    for (const word of ["포장해", "주세요"]) {
      const tile = [...pool.querySelectorAll("button")].find(
        (b) => b.textContent === word
      )!
      fireEvent.click(tile)
    }
    click("Check")
    expect(screen.getByText("Understood")).toBeTruthy()
    click(/Continue/)

    // The missed order question, once more, before the wrap.
    expect(screen.getByText("Once more")).toBeTruthy()
    fireEvent.click(screen.getByRole("radio", { name: "One iced americano" }))
    click("Check")
    click(/Continue/)

    expect(
      screen.getByText("1 of 2 understood on the first listen")
    ).toBeTruthy()
    expect(screen.getByText("1 revisited after the conversation")).toBeTruthy()
  })

  it("resumes at the line it was left on, by message id", async () => {
    const storage = memoryStorage()
    createResumeStore(storage).set(FIXTURE_TOPIK_KEY, {
      batchId: 2,
      conversation: 1,
      messageId: "c2-m2",
    })
    renderLesson(storage)

    fireEvent.click(await screen.findByRole("button", { name: /Continue/ }))
    expect(await screen.findByText("카드로 할게요. 감사합니다.")).toBeTruthy()
    expect(screen.getByText("Conversation 2 of 2")).toBeTruthy()
  })

  it("keeps the gloss out of feedback while another check on the line is pending (Codex, #1544)", async () => {
    const storage = memoryStorage()
    createResumeStore(storage).set(FIXTURE_TOPIK_KEY, {
      batchId: 2,
      conversation: 1,
      messageId: "c2-m2",
    })
    renderLesson(storage)
    fireEvent.click(await screen.findByRole("button", { name: /Continue/ }))
    await screen.findByText("카드로 할게요. 감사합니다.")

    // c2-m2 anchors two checks: the 감사합니다 syllable board, then "card".
    click(/^Next/)
    const pool = document.querySelector("[data-slot='topik-tile-pool']")!
    for (const syllable of ["감", "사", "합", "니", "다"]) {
      const tile = [...pool.querySelectorAll("button")].find(
        (b) => b.textContent === syllable && !b.disabled
      )!
      fireEvent.click(tile)
    }
    click("Check")
    expect(screen.getByText("Understood")).toBeTruthy()
    expect(screen.queryByText("I'll pay by card. Thank you.")).toBeNull()
    expect(
      screen.getByText(/English unlocks after the other question/)
    ).toBeTruthy()

    // The second check on the same line: once answered, the gloss is earned.
    click(/Continue/)
    fireEvent.click(screen.getAllByRole("radio")[0]!)
    click("Check")
    expect(screen.getByText("I'll pay by card. Thank you.")).toBeTruthy()
  })

  it("keeps answered checks and promised repeats across a reload (Codex, #1544)", async () => {
    const storage = memoryStorage()
    renderLesson(storage)
    fireEvent.click(
      await screen.findByRole("button", { name: /Ordering at a café/ })
    )
    await screen.findByText("어서 오세요. 뭐 드릴까요?")
    click(/^Next/) // line 2
    click(/^Next/) // its check
    fireEvent.click(screen.getByRole("radio", { name: "A cake" }))
    click("Check")
    expect(screen.getByText(/comes back once more/)).toBeTruthy()

    // The tab reloads before Continue.
    cleanup()
    renderLesson(storage)
    fireEvent.click(await screen.findByRole("button", { name: /Continue/ }))

    // Back at the check's line; the answered check is passed over.
    expect(
      await screen.findByText("아이스 아메리카노 한 잔 주세요.")
    ).toBeTruthy()
    click(/^Next/)
    expect(screen.getByText("여기서 드시고 가세요?")).toBeTruthy()
    click(/^Next/) // line 4
    click(/^Next/) // its tile check
    const pool = document.querySelector("[data-slot='topik-tile-pool']")!
    for (const word of ["포장해", "주세요"]) {
      fireEvent.click(
        [...pool.querySelectorAll("button")].find(
          (b) => b.textContent === word
        )!
      )
    }
    click("Check")
    click(/Continue/)

    // The miss from before the reload still comes back.
    expect(screen.getByText("Once more")).toBeTruthy()
    fireEvent.click(screen.getByRole("radio", { name: "One iced americano" }))
    click("Check")
    click(/Continue/)
    expect(
      screen.getByText("1 of 2 understood on the first listen")
    ).toBeTruthy()
  })

  it("finds the saved conversation by its id when the file reorders them (Codex, #1544)", async () => {
    const storage = memoryStorage()
    createResumeStore(storage).set(FIXTURE_TOPIK_KEY, {
      batchId: 2,
      conversation: 1,
      messageId: "c2-m2",
    })
    // The file now lists conversation 2 first.
    renderLesson(storage, {
      load: () => Promise.resolve([...FIXTURE_BATCHES].reverse()),
    })
    fireEvent.click(await screen.findByRole("button", { name: /Continue/ }))
    expect(await screen.findByText("카드로 할게요. 감사합니다.")).toBeTruthy()
    expect(screen.getByText("Conversation 1 of 2")).toBeTruthy()
  })

  it("does not resume a point that cannot say which conversation it was", async () => {
    const storage = memoryStorage()
    createResumeStore(storage).set(FIXTURE_TOPIK_KEY, {
      conversation: 1,
      messageId: "c2-m2",
    })
    renderLesson(storage)
    fireEvent.click(await screen.findByRole("button", { name: /Continue/ }))
    expect(await screen.findByText("어서 오세요. 뭐 드릴까요?")).toBeTruthy()
    expect(screen.getByText("Conversation 1 of 2")).toBeTruthy()
  })
})
