import { PromptCard } from "@lesson-crm/components/prompt-card"
import { buildLessonPrompt } from "@some-ui/topik"
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

afterEach(() => {
  stubClipboard(undefined)
})

describe("PromptCard", () => {
  it("copies the generator prompt for the weekly batch, with the chosen request", async () => {
    const writeText = vi.fn(() => Promise.resolve())
    stubClipboard({ writeText })
    render(<PromptCard />)

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
        audience: "batch",
      })
    )
    expect(screen.getByRole("button", { name: /Copied/ })).toBeInTheDocument()
  })

  it("shows the prompt to copy by hand where the page has no clipboard", async () => {
    stubClipboard(undefined)
    render(<PromptCard />)

    fireEvent.click(screen.getByRole("button", { name: /Copy the prompt/ }))
    await settle()

    expect(screen.getByRole("alert")).toHaveTextContent(
      /isn.t served over HTTPS/
    )
    expect(screen.getByLabelText("Prompt to copy")).toHaveValue(
      buildLessonPrompt({ level: 2, conversations: 3, audience: "batch" })
    )
  })

  it("forgets a copy once the request changes", async () => {
    stubClipboard({ writeText: vi.fn(() => Promise.resolve()) })
    render(<PromptCard />)

    fireEvent.click(screen.getByRole("button", { name: /Copy the prompt/ }))
    await settle()
    fireEvent.click(screen.getByRole("radio", { name: "TOPIK 5" }))
    expect(
      screen.getByRole("button", { name: /Copy the prompt/ })
    ).toBeInTheDocument()
  })
})
