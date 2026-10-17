import type {
  Playback,
  Recording,
  StartRecording,
  Take,
} from "@some-ui/voice-capture"
import type { JournalProps } from "@soundbites/components/journal"
import { Journal } from "@soundbites/components/journal"
import {
  memoryJournalStore,
  plan,
  take,
} from "@soundbites/lib/journal/__tests__/fixture"
import type { JournalPlan, JournalTake } from "@soundbites/lib/journal/plan"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Mock } from "vitest"
import { describe, expect, it, vi } from "vitest"

/** A microphone that hears `durationMs` of speech per take. */
function fakeMic(durationMs = 21_000): Mock<StartRecording> {
  return vi.fn(
    (): Promise<Recording> =>
      Promise.resolve({
        level: (): number => 0.3,
        finish: (): Promise<Take> =>
          Promise.resolve({
            blob: new Blob(["voice"], { type: "audio/webm" }),
            mimeType: "audio/webm;codecs=opus",
            durationMs,
          }),
        discard: (): void => undefined,
      })
  )
}

function setup(
  options: {
    plan?: JournalPlan | null
    takes?: ReadonlyArray<JournalTake>
    footer?: JournalProps["footer"]
    now?: number
  } = {}
): ReturnType<typeof memoryJournalStore> {
  const memory = memoryJournalStore({
    plan: options.plan === undefined ? plan() : options.plan,
    takes: options.takes,
  })
  render(
    <Journal
      ports={{
        store: memory.store,
        startRecording: fakeMic(),
        now: () => options.now ?? Date.UTC(2026, 9, 12, 13),
        readText: (file) =>
          new Promise((resolve) => {
            const reader = new FileReader()
            reader.onload = (): void => resolve(String(reader.result))
            reader.readAsText(file)
          }),
        onVisibility: (listener) => {
          listener(false)
          return (): void => undefined
        },
        player: {
          play: (): Playback => ({
            ended: new Promise(() => undefined),
            stop: vi.fn(),
          }),
        },
      }}
      footer={options.footer}
    />
  )
  return memory
}

describe("Journal", () => {
  it("opens a primer picked from storage and lays out its cuts", async () => {
    const memory = setup({ plan: null })
    expect(await screen.findByText("No primer open")).toBeInTheDocument()
    const file = new File(
      [
        JSON.stringify({
          version: 1,
          title: "AMO release notes",
          cuts: [
            {
              id: "gap",
              artifact: "Old notes",
              prompt: "What was missed?",
              targetSec: 25,
            },
            {
              id: "flow",
              artifact: "New flow",
              prompt: "Walk it.",
              targetSec: 40,
            },
          ],
        }),
      ],
      "primer.json",
      { type: "application/json" }
    )
    fireEvent.change(screen.getByLabelText(/open a primer from storage/i), {
      target: { files: [file] },
    })
    expect(
      await screen.findByRole("button", { name: /^1\. Old notes/ })
    ).toBeInTheDocument()
    expect(screen.getByText("What was missed?")).toBeInTheDocument()
    await waitFor(() =>
      expect(memory.state().plan?.primer.title).toBe("AMO release notes")
    )
  })

  it("shows when an unshared episode clears", async () => {
    setup({ takes: [take("gap", 9_000)] })
    expect(
      await screen.findByText(
        /3 cuts · 1 recorded · clears Oct 19 unless shared/
      )
    ).toBeInTheDocument()
  })

  it("records a take for the cut in focus, folds the timeline meanwhile, then moves on", async () => {
    const memory = setup()
    const timeline = await screen.findByRole("button", { name: /Timeline/ })
    expect(timeline).toHaveAttribute("aria-expanded", "true")
    fireEvent.click(screen.getByRole("button", { name: "Start talking" }))
    await screen.findByRole("button", { name: "Done, keep it" })
    expect(timeline).toHaveAttribute("aria-expanded", "false")
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Done, keep it" }))
      await Promise.resolve()
    })
    expect(
      await screen.findByText("Kept 0:21. Next cut is up.")
    ).toBeInTheDocument()
    expect(memory.state().takes).toEqual([
      expect.objectContaining({ cutId: "gap", durationMs: 21_000 }),
    ])
    expect(screen.getByText("Walk it.")).toBeInTheDocument()
    expect(timeline).toHaveAttribute("aria-expanded", "true")
  })

  it("hands the share its take count, and holds it while a take is out", async () => {
    const footer = vi.fn(
      ({ taking, takes }: { taking: boolean; takes: number }) => (
        <span>
          {takes} takes{taking ? ", taking" : ""}
        </span>
      )
    )
    setup({ takes: [take("gap", 9_000)], footer })
    fireEvent.click(await screen.findByRole("button", { name: /Share/ }))
    expect(screen.getByText("1 takes")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Start talking" }))
    expect(await screen.findByText("1 takes, taking")).toBeInTheDocument()
  })
})
