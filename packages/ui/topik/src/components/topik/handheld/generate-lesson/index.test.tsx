import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type {
  SceneAsk,
  SceneAskSnapshot,
} from "@topik/lib/topik/adapter/next-scene-ask"
import {
  draftNote,
  sceneDraft,
} from "@topik/lib/topik/adapter/scene-voice/__tests__/draft"
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
    const fold = screen.getByRole("button", { name: /Level and genre/ })
    expect(fold.textContent).toContain("TOPIK 3")
    fireEvent.click(fold)
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
      voiceNotes: [],
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
    expect(status.textContent).toMatch(/첫 차 · TOPIK 2/)
    expect(status.textContent).toMatch(/Ready to play/)
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

describe("GenerateLesson's spoken scene", () => {
  const notes = [draftNote("n1", 42_000, 1), draftNote("n2", 9_000, 2)]

  it("asks home with the draft's voice notes named by id, keeps them on the phone, and says what the host says (LG1)", () => {
    const draft = sceneDraft(notes)
    let snapshot: SceneAskSnapshot = { said: "Nothing asked yet.", held: false }
    const listeners = new Set<() => void>()
    const ask = vi.fn<SceneAsk["ask"]>(() => {
      snapshot = { said: "Home has your ask.", held: true }
      for (const listener of listeners) listener()
      return true
    })
    const onPromptHandedOff = vi.fn<(prompt: string) => void>()
    const { buildPrompt } = renderGenerate({
      sceneVoice: draft,
      onPromptHandedOff,
      sceneAsk: {
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
          listeners.add(listener)
          return (): void => {
            listeners.delete(listener)
          }
        },
        ask,
      },
    })
    expect(screen.getByText("Nothing asked yet.")).toBeTruthy()
    expect(screen.getByText(/go with your ask/)).toBeTruthy()
    click(/Ask for the next scene/)
    const asked = ask.mock.calls[0]?.[0]
    expect(asked?.notes).toEqual(["n1", "n2"])
    expect(asked?.stamp).toMatch(/^drama-\d{8}T\d{9}Z$/)
    expect(asked?.text).toContain(
      `<!-- notes: {"${asked?.stamp ?? ""}.voice-1.webm":"n1"`
    )
    expect(buildPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        voiceNotes: [
          `${asked?.stamp ?? ""}.voice-1.webm`,
          `${asked?.stamp ?? ""}.voice-2.webm`,
        ],
      })
    )
    expect(onPromptHandedOff).toHaveBeenCalledOnce()
    expect(screen.getByText("Home has your ask.")).toBeTruthy()
    expect(draft.store.getSnapshot().map(({ standing }) => standing)).toEqual([
      "current",
      "current",
    ])
  })

  it("says so when the phone could not keep an ask, and hands nothing off", () => {
    const onPromptHandedOff = vi.fn<(prompt: string) => void>()
    const none = { said: "Nothing asked yet.", held: false }
    renderGenerate({
      onPromptHandedOff,
      sceneAsk: {
        getSnapshot: () => none,
        subscribe: () => (): void => undefined,
        ask: () => false,
      },
    })
    click(/Ask for the next scene/)
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't keep/)
    expect(onPromptHandedOff).not.toHaveBeenCalled()
  })

  it("records nothing while the phone keeps as many notes as it can, and still plays and lets each go", () => {
    renderGenerate({ sceneVoice: sceneDraft(notes, { full: true }) })
    expect(screen.getByRole("status").textContent).toMatch(
      /kept as many voice notes as it can\. One you let go makes room once a home it's paired with has it/
    )
    expect(document.querySelector("[data-take]")).toBeNull()
    expect(
      screen.getAllByRole("button", { name: /^Play the take/ })
    ).toHaveLength(2)
    expect(
      screen.getAllByRole("button", { name: /^Let it go the take/ })
    ).toHaveLength(2)
    expect(
      screen.queryAllByRole("button", { name: /^Redo the take/ })
    ).toHaveLength(0)
  })

  it("opens on the draft left open, and starts another by setting it aside, kept (D3)", () => {
    const draft = sceneDraft(notes)
    renderGenerate({ sceneVoice: draft })
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    click(/Start a different scene/)
    expect(draft.store.getSnapshot().map(({ standing }) => standing)).toEqual([
      "set-aside",
      "set-aside",
    ])
    expect(screen.queryAllByRole("listitem")).toHaveLength(0)
    expect(screen.getByText(/Set aside/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Start talking" })).toBeTruthy()
  })
})
