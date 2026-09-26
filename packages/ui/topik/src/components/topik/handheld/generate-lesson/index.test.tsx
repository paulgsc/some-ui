import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { FIXTURE_BATCHES } from "@topik/components/topik/handheld/handheld-lesson/fixture"
import type { ConversationBatch, TopikMetadata } from "@topik/lib/topik"
import type { LessonRequest } from "@topik/lib/topik/generation"
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
  onSave: ReturnType<typeof vi.fn>
} => {
  const buildPrompt = vi.fn(
    (request: Omit<LessonRequest, "survey">) =>
      `PROMPT level=${request.level} scene=${request.scene ?? "-"}`
  )
  const onSave =
    vi.fn<(meta: TopikMetadata, batches: Array<ConversationBatch>) => void>()
  render(
    <GenerateLesson
      defaultLevel={3}
      buildPrompt={buildPrompt}
      onSave={onSave}
      short={false}
      {...props}
    />
  )
  return { buildPrompt, onSave }
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
  it("asks for the chosen level and scene", async () => {
    const writeText = stubClipboard(() => Promise.resolve())
    const { buildPrompt } = renderGenerate()
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
    })
    expect(writeText).toHaveBeenCalledWith(
      "PROMPT level=5 scene=the will is read"
    )
  })

  it("shows the prompt to copy by hand when the clipboard refuses", async () => {
    stubClipboard(() => Promise.reject(new Error("denied")))
    renderGenerate()
    click(/Copy the prompt/)
    const manual = await screen.findByRole("textbox", {
      name: "Prompt to copy",
    })
    expect(manual.textContent).toBe("PROMPT level=3 scene=-")
    expect(screen.queryByText(/Copied/)).toBeNull()
  })

  it("says why a reply is not a lesson, and saves nothing", () => {
    const { onSave } = renderGenerate()
    paste("Sorry, I can't help with that.")
    click("Check the lesson")
    expect(screen.getByRole("alert").textContent).toMatch(/No lesson found/)
    expect(screen.queryByRole("button", { name: /Save and start/ })).toBeNull()
    expect(onSave).not.toHaveBeenCalled()
  })

  it("names probe problems, hands the fixes to the model, and still lets it start", async () => {
    const writeText = stubClipboard(() => Promise.resolve())
    const { onSave } = renderGenerate()
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

    click(/Save and start/)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      key: "local:untitled-lesson",
      batchCount: FIXTURE_BATCHES.length,
    })
  })

  it("asks for a fresh check after the reply changes", () => {
    renderGenerate({ initialReply: reply(FIXTURE_BATCHES) })
    expect(screen.getByRole("button", { name: /Save and start/ })).toBeTruthy()
    paste(`${reply(FIXTURE_BATCHES)}\n`)
    expect(screen.queryByRole("button", { name: /Save and start/ })).toBeNull()
    expect(
      screen.getByRole("button", { name: "Check the lesson" })
    ).toBeTruthy()
  })
})
