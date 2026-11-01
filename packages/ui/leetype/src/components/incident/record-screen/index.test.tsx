/**
 * The record screen on the take pattern's parts (MIC4, #2374): tap to
 * record and tap to stop, the take's row once it is the answer, and typing
 * and passing beside them. The take's view is the play runtime's, over the
 * simulated microphone every screen's tests share.
 */
import type { JSX } from "react"
import { useSyncExternalStore } from "react"
import { RecordScreenView } from "@leetype/components/incident/record-screen"
import { IncidentPlayRuntime } from "@leetype/lib/leetype/incident-play"
import { AB_FIXTURES } from "@leetype/lib/leetype/session-file/__tests__/fixtures"
import { createSessionLogStore } from "@leetype/lib/leetype/session-log"
import type { PhoneTakes } from "@leetype/lib/leetype/spoken-take/__tests__/phone"
import { phoneTakes } from "@leetype/lib/leetype/spoken-take/__tests__/phone"
import { SessionFileSchema } from "@leetype/types/session-file"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { TAKE_WORDS } from "@some-ui/voice-capture"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const FILE = SessionFileSchema.parse(AB_FIXTURES[1]?.raw)
const TAKE = FILE.screens.s15

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Variant B's short form, played to its take on s15. */
function atTheTake(takes: PhoneTakes): IncidentPlayRuntime {
  let id = 0
  const runtime = new IncidentPlayRuntime({
    log: createSessionLogStore(memoryStorage()),
    now: (): number => 0,
    newId: (): string => `id${String(++id)}`,
    takes,
  })
  runtime.attach()
  runtime.start({ fileName: "t1-01", file: FILE, form: "short" })
  for (const input of [
    { type: "act", action: 0 },
    { type: "pick", option: 0 },
    { type: "continue" },
    { type: "act", action: 2 },
    { type: "pick", option: 0 },
  ] as const) {
    runtime.dispatch(input)
  }
  return runtime
}

/** The record screen as the session draws it, from the runtime's snapshot. */
const Screen = ({ runtime }: { runtime: IncidentPlayRuntime }): JSX.Element => {
  const { play, take } = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot
  )
  if (TAKE?.type !== "record") throw new Error("s15 is not a take")
  return (
    <RecordScreenView
      screen={TAKE}
      glossary={{}}
      spoken={play?.spoken ?? null}
      take={take}
      onTap={runtime.tapTake}
      onPlay={runtime.playTake}
      onLetGo={runtime.letGoTake}
      onTyped={(text): void =>
        runtime.dispatch({ type: "answered", answer: { as: "typed", text } })
      }
      onPass={(): void => runtime.dispatch({ type: "pass" })}
      onTicked={vi.fn()}
    />
  )
}

const show = (runtime: IncidentPlayRuntime): void => {
  render(<Screen runtime={runtime} />)
}

const press = (name: string): void => {
  fireEvent.click(screen.getByRole("button", { name }))
}

const settle = async (ms = 0): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function typedAnswer(): void {
  press("Type it instead")
  fireEvent.change(screen.getByLabelText("Your answer, typed"), {
    target: { value: "A majority never held it." },
  })
}

describe("RecordScreenView", () => {
  it("records by tap, shows the time against the cap, then the take's row where the answer is said", async () => {
    const takes = phoneTakes()
    const runtime = atTheTake(takes)
    show(runtime)
    press(TAKE_WORDS.buttonLabel.ready)
    await settle(12_000)
    expect(screen.getByText("0:12 / 1:00")).toBeTruthy()
    press(TAKE_WORDS.buttonLabel.recording)
    await settle()
    expect(screen.getByText(new RegExp(TAKE_WORDS.place.phone))).toBeTruthy()
    for (const action of [TAKE_WORDS.play, TAKE_WORDS.redo, TAKE_WORDS.letGo]) {
      expect(
        screen.getByRole("button", {
          name: TAKE_WORDS.rowLabel(action, 12_000),
        })
      ).toBeTruthy()
    }
    expect(screen.getByText("Tick what your answer said")).toBeTruthy()
    expect(screen.queryByText(/You answered aloud/)).toBeNull()

    // Let go: the answer is withdrawn, and the take is set aside, kept.
    press(TAKE_WORDS.rowLabel(TAKE_WORDS.letGo, 12_000))
    expect(screen.getByText(TAKE_WORDS.setAside.phone)).toBeTruthy()
    expect(screen.queryByText("Tick what your answer said")).toBeNull()
    expect(
      screen.getByRole("button", { name: TAKE_WORDS.buttonLabel.ready })
    ).toBeTruthy()
  })

  it("still takes a typed answer when only the recordings are full", () => {
    const runtime = atTheTake(phoneTakes({ full: true, notesFull: false }))
    const onTyped = vi.spyOn(runtime, "dispatch")
    show(runtime)
    expect(screen.getByText(/You can still type one/)).toBeTruthy()
    expect(document.querySelector("[data-take]")).toBeNull()
    typedAnswer()
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(onTyped).toHaveBeenCalledWith({
      type: "answered",
      answer: { as: "typed", text: "A majority never held it." },
    })
  })

  it("takes no answer at all once the notes are full", () => {
    show(atTheTake(phoneTakes({ full: true, notesFull: true })))
    typedAnswer()
    expect(screen.getByRole("button", { name: "Done" })).toHaveProperty(
      "disabled",
      true
    )
  })
})
