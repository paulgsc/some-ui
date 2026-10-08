import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { FIXTURE_BATCHES } from "@topik/components/topik/handheld/handheld-lesson/fixture"
import type { ConversationBatch, TopikMetadata } from "@topik/lib/topik"
import type { DramaLesson } from "@topik/lib/topik/core/drama"
import type { LessonFormat, LessonRequest } from "@topik/lib/topik/generation"
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

const reply = (batches: unknown): string =>
  ["```json", JSON.stringify(batches), "```"].join("\n")

/** The fixture, with its build probe asked to turn a line into itself. */
const withIdentityBuild = (): Array<ConversationBatch> => {
  const batches = structuredClone(FIXTURE_BATCHES)
  const probe = batches[0]?.probes?.find(
    (candidate) => candidate.id === "c1-build-negation"
  )
  if (probe?.kind !== "build" || !probe.source) {
    throw new Error("fixture lost c1-build-negation")
  }
  probe.target = probe.source
  return batches
}

const renderGenerate = (
  props: Partial<Parameters<typeof GenerateLesson>[0]> = {}
): {
  buildPrompt: ReturnType<typeof vi.fn>
  onStart: Mock<
    (meta: TopikMetadata, batches: Array<ConversationBatch>) => void
  >
  onStartTree: Mock<(lesson: DramaLesson) => void>
} => {
  const buildPrompt = vi.fn(
    (request: Omit<LessonRequest, "survey">, format: LessonFormat) =>
      `PROMPT ${format} level=${request.level} scene=${request.scene ?? "-"}`
  )
  const onStart =
    vi.fn<(meta: TopikMetadata, batches: Array<ConversationBatch>) => void>()
  const onStartTree = vi.fn<(lesson: DramaLesson) => void>()
  render(
    <GenerateLesson
      defaultLevel={3}
      buildPrompt={buildPrompt}
      onStart={onStart}
      onStartTree={onStartTree}
      short={false}
      {...props}
    />
  )
  return { buildPrompt, onStart, onStartTree }
}

const conversations = (): void => {
  fireEvent.click(screen.getByRole("radio", { name: "Conversations" }))
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
  it("asks for a drama by default, at the chosen level and scene", async () => {
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
    expect(buildPrompt).toHaveBeenCalledWith(
      { level: 5, scene: "the will is read" },
      "tree"
    )
    expect(writeText).toHaveBeenCalledWith(
      "PROMPT tree level=5 scene=the will is read"
    )
    expect(onPromptHandedOff).toHaveBeenCalledExactlyOnceWith(
      "PROMPT tree level=5 scene=the will is read"
    )
    conversations()
    click(/Copy the prompt/)
    expect(buildPrompt).toHaveBeenLastCalledWith(
      { level: 5, scene: "the will is read" },
      "conversations"
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
    // Another format's prompt is not the one handed off.
    click(/Copied/)
    await screen.findByRole("textbox", { name: "Prompt to copy" })
    conversations()
    expect(screen.queryByRole("textbox", { name: "Prompt to copy" })).toBeNull()
  })

  it("says why a reply is not a lesson, and saves nothing", () => {
    const { onStart } = renderGenerate()
    conversations()
    paste("Sorry, I can't help with that.")
    click("Check the lesson")
    expect(screen.getByRole("alert").textContent).toMatch(/No lesson found/)
    expect(screen.queryByRole("button", { name: /^Start$/ })).toBeNull()
    expect(onStart).not.toHaveBeenCalled()
  })

  it("names probe problems, hands the fixes to the model, and still lets it start", async () => {
    const writeText = stubClipboard(() => Promise.resolve())
    const onPromptHandedOff = vi.fn()
    const { onStart } = renderGenerate({ onPromptHandedOff })
    conversations()
    paste(reply(withIdentityBuild()))
    click("Check the lesson")

    const status = screen.getByRole("status")
    expect(status.textContent).toMatch(/1 probe problem:/)
    expect(status.textContent).toMatch(
      /c1-build-negation: target is the source itself/
    )

    click("Copy the fixes for your model")
    await screen.findByText(/Fixes copied/)
    const fixes = String(writeText.mock.calls[0]?.[0])
    expect(fixes).toContain(
      "- error: conversation 1, probe c1-build-negation: target is the source itself"
    )
    // The fixes are not the prompt: the survey's free text stays.
    expect(onPromptHandedOff).not.toHaveBeenCalled()

    click(/^Start$/)
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onStart.mock.calls[0]?.[0]).toMatchObject({
      key: "local:untitled-lesson",
      batchCount: FIXTURE_BATCHES.length,
    })
    // The probe the audit named is withheld from what plays; the rest stay.
    const played = onStart.mock.calls[0]?.[1] ?? []
    const ids = played.flatMap((batch) =>
      (batch.probes ?? []).map((probe) => probe.id)
    )
    expect(ids).not.toContain("c1-build-negation")
    expect(ids).toContain("c1-request-forms")
  })

  it("asks for a fresh check after the reply or the format changes", () => {
    renderGenerate()
    conversations()
    paste(reply(FIXTURE_BATCHES))
    click("Check the lesson")
    expect(screen.getByRole("button", { name: /^Start$/ })).toBeTruthy()
    paste(`${reply(FIXTURE_BATCHES)}\n`)
    expect(screen.queryByRole("button", { name: /^Start$/ })).toBeNull()
    click("Check the lesson")
    fireEvent.click(screen.getByRole("radio", { name: "Drama" }))
    expect(screen.queryByRole("button", { name: /^Start$/ })).toBeNull()
    expect(
      screen.getByRole("button", { name: "Check the lesson" })
    ).toBeTruthy()
  })
})

describe("GenerateLesson, with a scene tree", () => {
  it("checks a pasted tree with both audits and plays what they hold", () => {
    const { onStart, onStartTree } = renderGenerate()
    paste(workedExample())
    click("Check the lesson")
    const status = screen.getByRole("status")
    expect(status.textContent).toMatch(/Drama · TOPIK 2 · 6 scenes/)
    expect(status.textContent).toMatch(/Every choice will be asked as written/)
    click(/^Start$/)
    expect(onStartTree).toHaveBeenCalledExactlyOnceWith(workedLesson())
    expect(onStart).not.toHaveBeenCalled()
  })

  it("names a rejected tree's findings by path and hands back the fixes", async () => {
    const writeText = stubClipboard(() => Promise.resolve())
    const { onStartTree } = renderGenerate()
    const tree: Record<string, unknown> = JSON.parse(workedExample())
    paste(fenced({ ...tree, pov: "nobody" }))
    click("Check the lesson")
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
    click("Check the lesson")
    expect(screen.getByRole("alert").textContent).toMatch(/No scene tree found/)
  })
})
