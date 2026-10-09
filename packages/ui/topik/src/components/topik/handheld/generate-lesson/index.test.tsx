import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { DramaLesson } from "@topik/lib/topik/core/drama"
import type { TreeRequest } from "@topik/lib/topik/generation"
import {
  fenced,
  workedExample,
  workedLesson,
} from "@topik/lib/topik/generation/tree-intake/worked-example"
import type { Mock } from "vitest"
import { afterEach, describe, expect, it, vi } from "vitest"

import { GenerateLesson } from "."

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const stubClipboard = (
  writeText: (text: string) => Promise<void>
): ReturnType<typeof vi.fn> => {
  const spy = vi.fn(writeText)
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: spy } })
  return spy
}

const renderGenerate = (
  props: Partial<Parameters<typeof GenerateLesson>[0]> = {}
): {
  buildPrompt: ReturnType<typeof vi.fn>
  onStartTree: Mock<(lesson: DramaLesson) => void>
} => {
  const buildPrompt = vi.fn(
    (request: Pick<TreeRequest, "level" | "scene">) =>
      `PROMPT tree level=${request.level} scene=${request.scene ?? "-"}`
  )
  const onStartTree = vi.fn<(lesson: DramaLesson) => void>()
  render(
    <GenerateLesson
      defaultLevel={3}
      buildPrompt={buildPrompt}
      onStartTree={onStartTree}
      short={false}
      {...props}
    />
  )
  return { buildPrompt, onStartTree }
}

const click = (name: string | RegExp): void => {
  fireEvent.click(screen.getByRole("button", { name }))
}

const paste = (value: string): void => {
  fireEvent.change(
    screen.getByRole("textbox", { name: "Your model's reply" }),
    { target: { value } }
  )
}

describe("GenerateLesson", () => {
  it("asks for a drama at the chosen level and scene", async () => {
    const writeText = stubClipboard(() => Promise.resolve())
    const onPromptHandedOff = vi.fn()
    const { buildPrompt } = renderGenerate({ onPromptHandedOff })
    expect(
      screen
        .getByRole("radio", { name: "TOPIK 3" })
        .getAttribute("aria-checked")
    ).toBe("true")
    fireEvent.click(screen.getByRole("radio", { name: "TOPIK 5" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Scene" }), {
      target: { value: "  the will is read  " },
    })
    click(/Copy the prompt/)
    await screen.findByText(/Copied/)
    expect(buildPrompt).toHaveBeenCalledWith({
      level: 5,
      scene: "the will is read",
      genres: [],
    })
    expect(writeText).toHaveBeenCalledWith(
      "PROMPT tree level=5 scene=the will is read"
    )
    expect(onPromptHandedOff).toHaveBeenCalledExactlyOnceWith(
      "PROMPT tree level=5 scene=the will is read"
    )
  })

  it("shows the prompt to copy by hand when the clipboard refuses, and says it was handed off only once it is", async () => {
    stubClipboard(() => Promise.reject(new Error("denied")))
    const onPromptHandedOff = vi.fn()
    renderGenerate({ onPromptHandedOff })
    click(/Copy the prompt/)
    const manual = await screen.findByRole("textbox", {
      name: "Prompt to copy",
    })
    expect(manual.textContent).toBe("PROMPT tree level=3 scene=-")
    expect(screen.queryByText(/Copied/)).toBeNull()
    expect(onPromptHandedOff).not.toHaveBeenCalled()
    // A copy event proves some text was copied, not all of it.
    fireEvent.copy(manual)
    expect(onPromptHandedOff).not.toHaveBeenCalled()
    click(/I've copied it/)
    expect(onPromptHandedOff).toHaveBeenCalledExactlyOnceWith(
      "PROMPT tree level=3 scene=-"
    )
    expect(screen.queryByRole("textbox", { name: "Prompt to copy" })).toBeNull()
    expect(screen.getByText(/Copied/)).toBeTruthy()
  })

  it("asks for a fresh check after the reply changes", () => {
    renderGenerate()
    paste(workedExample())
    click("Read the reply")
    expect(screen.getByRole("button", { name: /^Start$/ })).toBeTruthy()
    paste(`${workedExample()}\n`)
    expect(screen.queryByRole("button", { name: /^Start$/ })).toBeNull()
    expect(screen.getByRole("button", { name: "Read the reply" })).toBeTruthy()
  })
})

describe("GenerateLesson, with a scene tree", () => {
  it("checks a pasted tree with both audits and plays what they hold", () => {
    const { onStartTree } = renderGenerate()
    paste(workedExample())
    click("Read the reply")
    const status = screen.getByRole("status")
    expect(status.textContent).toMatch(/Drama · TOPIK 2 · 6 scenes/)
    expect(status.textContent).toMatch(/Every choice will be asked as written/)
    click(/^Start$/)
    expect(onStartTree).toHaveBeenCalledExactlyOnceWith(workedLesson())
  })

  it("names a rejected tree's findings by path and hands back the fixes", async () => {
    const writeText = stubClipboard(() => Promise.resolve())
    const { onStartTree } = renderGenerate()
    const tree: Record<string, unknown> = JSON.parse(workedExample())
    paste(fenced({ ...tree, pov: "nobody" }))
    click("Read the reply")
    expect(screen.getByRole("alert").textContent).toMatch(
      /pov: "nobody" is not in the cast/
    )
    expect(screen.queryByRole("button", { name: /^Start$/ })).toBeNull()
    click("Copy the fixes for your model")
    await screen.findByText(/Fixes copied/)
    expect(writeText).toHaveBeenCalledOnce()
    expect(onStartTree).not.toHaveBeenCalled()
  })

  it("says a drama was expected when the reply holds none", () => {
    renderGenerate()
    paste("Sorry, I can't help with that.")
    click("Read the reply")
    expect(screen.getByRole("alert").textContent).toMatch(/No scene tree found/)
  })
})
