import { PromptCard } from "@lesson-crm/components/prompt-card"
import type { CrmNotice, Reporting } from "@lesson-crm/lib/operation"
import { toIntentError } from "@some-ui/intent-kit"
import { buildLessonPrompt, buildTreePrompt } from "@some-ui/topik"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

function stubClipboard(clipboard: unknown): void {
  Object.defineProperty(navigator, "clipboard", {
    value: clipboard,
    configurable: true,
  })
}

function recording(): Reporting & { notices: Array<CrmNotice> } {
  const notices: Array<CrmNotice> = []
  return {
    notices,
    notify: (notice) => notices.push(notice),
    mapError: toIntentError,
  }
}

afterEach(() => {
  stubClipboard(undefined)
})

describe("PromptCard", () => {
  it("copies the generator prompt for the weekly batch, with the chosen request", async () => {
    const writeText = vi.fn(() => Promise.resolve())
    stubClipboard({ writeText })
    const reporting = recording()
    render(<PromptCard reporting={reporting} />)

    fireEvent.click(screen.getByRole("radio", { name: "TOPIK 4" }))
    fireEvent.change(screen.getByLabelText("Scene"), {
      target: { value: "the wedding hall" },
    })
    fireEvent.change(screen.getByLabelText("Conversations"), {
      target: { value: "2" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Copy the prompt/ }))
    await settle()

    expect(writeText).toHaveBeenCalledWith(
      buildLessonPrompt({
        level: 4,
        scene: "the wedding hall",
        conversations: 2,
      })
    )
    expect(screen.getByRole("button", { name: /Copied/ })).toBeInTheDocument()
    expect(reporting.notices).toEqual([
      { tone: "success", title: "Prompt copied: paste it into your model" },
    ])
  })

  it("copies the scene-tree prompt, which asks no conversation count", async () => {
    const writeText = vi.fn(() => Promise.resolve())
    stubClipboard({ writeText })
    render(<PromptCard reporting={recording()} />)

    fireEvent.click(screen.getByRole("radio", { name: "Scene tree" }))
    expect(screen.queryByLabelText("Conversations")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("radio", { name: "TOPIK 3" }))
    fireEvent.click(screen.getByRole("button", { name: /Copy the prompt/ }))
    await settle()

    expect(writeText).toHaveBeenCalledWith(
      buildTreePrompt({ level: 3, audience: "batch" })
    )
  })

  it("shows the prompt to copy by hand where the page has no clipboard", async () => {
    stubClipboard(undefined)
    const reporting = recording()
    render(<PromptCard reporting={reporting} />)

    fireEvent.click(screen.getByRole("button", { name: /Copy the prompt/ }))
    await settle()

    expect(reporting.notices).toMatchObject([
      {
        tone: "error",
        title: "Couldn't copy the prompt",
        error: { summary: expect.stringMatching(/isn.t served over HTTPS/) },
      },
    ])
    expect(screen.getByLabelText("Prompt to copy")).toHaveValue(
      buildLessonPrompt({ level: 2, conversations: 3 })
    )
  })

  it("forgets a copy once the request changes", async () => {
    stubClipboard({ writeText: vi.fn(() => Promise.resolve()) })
    const reporting = recording()
    render(<PromptCard reporting={reporting} />)

    fireEvent.click(screen.getByRole("button", { name: /Copy the prompt/ }))
    await settle()
    fireEvent.click(screen.getByRole("radio", { name: "TOPIK 5" }))
    expect(
      screen.getByRole("button", { name: /Copy the prompt/ })
    ).toBeInTheDocument()
  })
})
