/**
 * The scenario family (MIC1's `takeScenarios`) played against the rendered
 * take pattern (MIC2, #2372): each screen is a `TakeList` on its own pattern,
 * all on one simulated microphone and one owner. A tap is a click on the
 * rendered take button, whether a take is under way is read from the button,
 * and each ending is read from the line the screen shows beside it. VC2 and
 * VC3 (`@some-ui/voice-capture`, `lib/properties.ts`) must hold on every
 * trace, so no ending is silent on screen and the microphone is never left
 * open by the parts.
 */
import type { JSX } from "react"
import { useSyncExternalStore } from "react"
import type { TakePattern, TakePatternOptions } from "@some-ui/voice-capture"
import { takePattern } from "@some-ui/voice-capture"
import type {
  MemoryTakes,
  ScenarioBuild,
  ScenarioPhone,
  ScenarioScreen,
} from "@some-ui/voice-capture/testing"
import {
  assertTakeProperties,
  memoryKeep,
  memoryTakes,
  simulatedPlayer,
} from "@some-ui/voice-capture/testing"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, it, vi } from "vitest"

import { TakeList } from "../take-list"

const Screen = ({
  pattern,
  store,
  answers,
}: {
  pattern: TakePattern
  store: MemoryTakes
  answers: string
}): JSX.Element => {
  const takes = useSyncExternalStore(store.subscribe, store.getSnapshot)
  return <TakeList pattern={pattern} answers={answers} takes={takes} />
}

const UNDERWAY = new Set(["opening", "recording", "keeping"])

/** One rendered screen, watched through what it shows. */
function renderedScreen(
  root: HTMLElement,
  pattern: TakePattern
): ScenarioScreen {
  const button = (): HTMLButtonElement | null =>
    root.querySelector<HTMLButtonElement>("button[data-take]")
  let last: ReturnType<ScenarioScreen["ended"]> = null
  const read = (): void => {
    const line = root.querySelector("[data-take-ended]")
    const seq = Number(line?.getAttribute("data-take-ended") ?? 0)
    if (line === null || seq === last?.seq) return
    const { ended } = pattern.getSnapshot()
    last = {
      seq,
      // What the person was told, as the screen shows it.
      said: line.textContent,
      ending: ended?.seq === seq ? ended.ending : "failed",
      id: ended?.seq === seq ? ended.id : null,
    }
  }
  return {
    tap: (): void => {
      const at = button()
      if (at !== null) fireEvent.click(at)
    },
    leave: () => act(() => pattern.leave()),
    subscribe: (listener) => {
      const observer = new MutationObserver(() => {
        read()
        listener()
      })
      observer.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      })
      return () => observer.disconnect()
    },
    underway: () => UNDERWAY.has(button()?.dataset["take"] ?? ""),
    ended: (): ReturnType<ScenarioScreen["ended"]> => {
      read()
      return last
    },
  }
}

function renderedScreens(
  count: number
): (phone: ScenarioPhone) => ScenarioBuild {
  return (phone) => {
    const kept = memoryKeep(phone.keeps)
    const options: TakePatternOptions = {
      takes: { per: "one" },
      limits: phone.bounds.limits,
      redo: "supersede",
      letGo: "set-aside",
      play: "each",
    }
    const screens = Array.from({ length: count }, (_, at) => {
      const store = memoryTakes({ now: phone.now })
      const pattern = takePattern(
        {
          startRecording: phone.startRecording,
          now: phone.now,
          owner: phone.owner,
          deadlines: phone.bounds.deadlines,
          tickMs: phone.bounds.tickMs,
          player: simulatedPlayer(),
          ...store.ports,
          // The family's keep answers as the trace says; the store lists
          // only what it kept.
          keep: (take, answers, supersedes, done) =>
            kept.keep(take, answers, (result) => {
              if (result.outcome === "kept") {
                store.ports.keep(take, answers, supersedes, () => undefined)
              }
              done(result)
            }),
        },
        options
      )
      const { container } = render(
        <Screen pattern={pattern} store={store} answers={`screen-${at}`} />
      )
      return renderedScreen(container, pattern)
    })
    return { screens, audio: kept.audio }
  }
}

describe("VC2, VC3: every trace of the family keeps every property on the rendered parts", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // A microphone past its deadline is reported (VC1); not this test's to read.
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("holds on every generated trace", async () => {
    await assertTakeProperties(
      {
        build: renderedScreens,
        advance: (ms) =>
          act(async () => {
            await vi.advanceTimersByTimeAsync(ms)
          }),
        now: Date.now,
        reset: () => {
          cleanup()
          vi.clearAllTimers()
        },
      },
      { numRuns: 40 }
    )
  }, 60_000)
})
