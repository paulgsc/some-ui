/**
 * @vitest-environment jsdom
 *
 * Studio's Spoken on the phone (W5), as the owner approved them on
 * 2026-11-20: a spoken card pasted and split into parts, a part read on the band
 * under its question, every take of it kept with Use this one, and the
 * essay's copy naming each question with its take.
 */
import { inMemoryStorage } from "@some-ui/core-utils"
import type { HeardAnswer } from "@some-ui/voice-capture"
import type { SimulatedPattern } from "@some-ui/voice-capture/testing"
import { simulatedPattern } from "@some-ui/voice-capture/testing"
import type * as ReactRouterModule from "@tanstack/react-router"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { bandPace } from "@/lib/interview-week/store"
import { lineOf, parseCard } from "@/lib/studio-spoken/model"
import type { SpokenRuntime } from "@/lib/studio-spoken/runtime"
import { createSpokenRuntime } from "@/lib/studio-spoken/runtime"
import { spokenStore } from "@/lib/studio-spoken/store"
import { SPOKEN_WORDS } from "@/lib/studio-spoken/words"
import { deskPatternOptions } from "@/lib/takes-desk/pattern"
import {
  PasteSpoken,
  SpokenList,
  SpokenPartPage,
  SpokenParts,
} from "@/components/studio/spoken"

const navigate = vi.hoisted(() => vi.fn())

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const { withPlainLink } = await import("@/test-support/router-stubs")
  return {
    ...withPlainLink(await importOriginal<typeof ReactRouterModule>()),
    useNavigate: (): typeof navigate => navigate,
  }
})

vi.mock("@/lib/build-profile", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  hasAudience: (audience: string): boolean => audience === "apk",
}))

const W = SPOKEN_WORDS

const PASTED = `How I built Rust Rounds

SCRIPT
QUESTION What is Rust Rounds?
Rust Rounds is a week of Rust on my phone.

OWN WORDS
Why I stopped writing Rust every day.`

function phone(
  heard: HeardAnswer = { kind: "heard", text: "Rust Rounds is" }
): { sim: SimulatedPattern; runtime: SpokenRuntime } {
  const sim = simulatedPattern({
    options: deskPatternOptions(
      { max: 40, maxMs: 180_000 },
      { takes: { per: "many", max: 40, full: "refuse" }, play: "each" }
    ),
  })
  const storage = inMemoryStorage()
  let seen: ReadonlyArray<{ id: string; line: string }> = []
  let from: unknown = null
  const runtime: SpokenRuntime = createSpokenRuntime({
    store: spokenStore(storage),
    pace: bandPace(storage),
    takes: {
      getSnapshot: () => {
        const now = sim.store.getSnapshot()
        if (now !== from) {
          from = now
          seen = now.map((take) => ({ id: take.id, line: take.answers }))
        }
        return seen
      },
      subscribe: sim.store.subscribe,
    },
    pattern: sim.pattern,
    audioHere: () => Promise.resolve(null),
    audioFromHome: () => Promise.resolve(null),
    heard: () => Promise.resolve(heard),
    player: sim.player,
    now: Date.now,
    random: () => 0.5,
  })
  return { sim, runtime }
}

const pass = async (ms = 0): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-20T22:00:00Z"))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  navigate.mockReset()
})

describe("Studio's Spoken", () => {
  it("lists no card until one is pasted, then each with its parts and takes", () => {
    const { runtime } = phone()
    const { unmount } = render(<SpokenList runtime={runtime} />)
    expect(screen.getByText(W.none)).toBeTruthy()
    expect(
      screen.getByText(W.paste.open).closest("a")?.getAttribute("to")
    ).toBe("/journal/spoken/paste")
    unmount()
    act(() => {
      runtime.keep(parseCard(PASTED)!)
    })
    render(<SpokenList runtime={runtime} />)
    expect(screen.getByText("How I built Rust Rounds")).toBeTruthy()
    expect(
      screen.getByText(/Introduction · .* · 2 parts · no takes yet/u)
    ).toBeTruthy()
  })

  it("shows how a paste splits before it is kept, then opens the script", () => {
    const { runtime } = phone()
    render(<PasteSpoken runtime={runtime} />)
    const keep = screen.getByRole("button", { name: W.paste.keep })
    expect(keep.hasAttribute("disabled")).toBe(true)
    fireEvent.change(screen.getByLabelText(W.paste.label), {
      target: { value: PASTED },
    })
    expect(screen.getByTestId("script-split").textContent).toBe(
      W.paste.split(1, 1, 1)
    )
    fireEvent.click(keep)
    const kept = runtime.scripts.getSnapshot().at(0)
    expect(kept?.parts).toHaveLength(2)
    expect(navigate).toHaveBeenCalledWith({
      to: "/journal/spoken/$card",
      params: { card: kept?.id },
    })
  })

  it("reads a part under its question, keeps every take, and uses the one picked", async () => {
    const { runtime, sim } = phone()
    const id = runtime.keep(parseCard(PASTED)!)!
    render(<SpokenPartPage runtime={runtime} id={id} n={0} />)
    expect(screen.getByText(W.theyAsk)).toBeTruthy()
    expect(screen.getByText("What is Rust Rounds?")).toBeTruthy()
    expect(
      document.querySelector(`[data-script="${lineOf(id, 0)}"]`)
    ).not.toBeNull()
    // Two takes: said, then said again.
    for (let i = 0; i < 2; i += 1) {
      act(() => sim.pattern.tap(lineOf(id, 0), null))
      await pass(2_000)
      act(() => sim.pattern.tap(lineOf(id, 0), null))
      await pass()
    }
    expect(screen.getByText(W.takes(2))).toBeTruthy()
    const rows = document.querySelectorAll("[data-script-take]")
    expect(rows).toHaveLength(2)
    // Newest first; Use this one on the first take said.
    const first = rows[1]
    if (!(first instanceof HTMLElement)) throw new Error("no first take")
    fireEvent.click(within(first).getByRole("button", { name: W.useThis }))
    expect(runtime.scripts.getSnapshot()[0]?.parts[0]?.using).toBe(
      first.dataset.scriptTake
    )
    expect(within(first).getByText(/Take 1 · on home · Using/u)).toBeTruthy()
  })

  it("lets no take home couldn't hear be the one an essay uses", async () => {
    const { runtime, sim } = phone({ kind: "heard", text: "" })
    const id = runtime.keep(parseCard(PASTED)!)!
    render(<SpokenPartPage runtime={runtime} id={id} n={1} />)
    // An own-words part: the prompt, no band.
    expect(document.querySelector("[data-script]")).toBeNull()
    act(() => sim.pattern.tap(lineOf(id, 1), null))
    await pass(2_000)
    act(() => sim.pattern.tap(lineOf(id, 1), null))
    await pass()
    expect(screen.getByText(W.heard.none)).toBeTruthy()
    expect(screen.queryByRole("button", { name: W.useThis })).toBeNull()
  })

  it("copies each question with the take that answers it, for the essay", async () => {
    const { runtime, sim } = phone()
    const id = runtime.keep(parseCard(PASTED)!)!
    const leave = runtime.attach()
    act(() => sim.pattern.tap(lineOf(id, 0), null))
    await pass(2_000)
    act(() => sim.pattern.tap(lineOf(id, 0), null))
    await pass()
    const take = runtime.scripts.getSnapshot()[0].parts[0].takes[0]
    runtime.use(id, 0, take)
    render(<SpokenParts runtime={runtime} id={id} />)
    const block = document.querySelector("pre")?.textContent ?? ""
    expect(block).toContain("  Asks: What is Rust Rounds?")
    expect(block).toContain(`  From take ${take}`)
    expect(block).toContain("Category: introduction")
    leave()
  })

  it("says so when the card isn't on this phone", () => {
    const { runtime } = phone()
    render(<SpokenParts runtime={runtime} id="scnope" />)
    expect(screen.getByText(W.lost)).toBeTruthy()
  })
})
