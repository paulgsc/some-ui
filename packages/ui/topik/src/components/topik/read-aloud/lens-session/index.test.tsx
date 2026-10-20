import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { LensSession } from "@topik/components/topik/read-aloud/lens-session"
import type {
  LensTakes,
  LensTakeSnapshot,
} from "@topik/lib/topik/adapter/lens-takes"
import type { LensRecordEntry } from "@topik/lib/topik/read-aloud/lens/record"
import { MISTAKES } from "@topik/lib/topik/read-aloud/mistakes"
import { REPO_LENS } from "@topik/lib/topik/read-aloud/repo-sets"
import { MAX_SCREEN_MS } from "@topik/lib/topik/read-aloud/timing"
import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** A port that keeps a 2.5 s take whenever one is stopped. */
function fakeTakes(
  initial: Partial<LensTakeSnapshot> = {}
): LensTakes & { started: Array<string> } {
  let snapshot: LensTakeSnapshot = {
    take: { kind: "idle" },
    said: null,
    last: null,
    kept: null,
    playing: false,
    full: false,
    ...initial,
  }
  const listeners = new Set<() => void>()
  const set = (next: Partial<LensTakeSnapshot>): void => {
    snapshot = { ...snapshot, ...next }
    for (const listener of listeners) listener()
  }
  const started: Array<string> = []
  return {
    started,
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start: (line): void => {
      started.push(line)
      set({ take: { kind: "recording", elapsedMs: 0 } })
    },
    stop: (): void => {
      const kept = { id: `take-${started.length}`, durationMs: 2_500 }
      set({ take: { kind: "idle" }, last: kept, kept })
    },
    playLast: () => undefined,
    reset: () => set({ take: { kind: "idle" }, last: null }),
  }
}

/** Answer whatever the card asks, the first way it offers. */
function answerCard(): void {
  const card = document.querySelector('[data-slot="lens-card"]')
  if (card?.getAttribute("data-phase") === "item") {
    const fine = screen.queryByRole("button", { name: "Looks right" })
    const candidate = Array.from(document.querySelectorAll("button[lang=ko]"))
    fireEvent.click(fine ?? candidate[0] ?? document.body)
    return
  }
  if (card?.getAttribute("data-phase") === "step-down") {
    fireEvent.click(screen.getByRole("button", { name: "Skip" }))
    return
  }
  const next = screen.getByRole("button", { name: /^(next|finish the set)$/i })
  fireEvent.click(next)
}

describe("LensSession", () => {
  it("runs a set to its summary with no English meaning on any screen (Cor. 4.8 (i))", () => {
    render(
      <LensSession
        deck={REPO_LENS}
        level={1}
        speech={null}
        seedKey={() => "session"}
        onExit={() => undefined}
      />
    )
    // Every meaning the deck holds: lines', words' and senses'. A short one
    // ("is", "what") is also a word of the screen's own English, so only
    // those of six letters or more are looked for, and not in the
    // catalogue's rules, which are English grammar ("before a vowel").
    const english = [
      ...REPO_LENS.lines.map((line) => line.english),
      ...REPO_LENS.words.map((word) => word.gloss),
      ...REPO_LENS.lines.flatMap((line) =>
        line.words.flatMap((word) => (word.sense ? [word.sense] : []))
      ),
    ].filter((meaning) => meaning.length >= 6)
    const rules = Object.values(MISTAKES).map(({ rule }) => rule)
    for (let step = 0; step < 60; step += 1) {
      const text = rules.reduce(
        (shown, rule) => shown.replaceAll(rule, ""),
        document.body.textContent
      )
      for (const gloss of english) expect(text).not.toContain(gloss)
      if (document.querySelector('[data-slot="lens-summary"]')) break
      answerCard()
    }
    expect(document.querySelector('[data-slot="lens-summary"]')).not.toBeNull()
    expect(screen.getByText(/^\d of 8 right$/)).toBeTruthy()
    // Nothing counts down, though the summary ends in two minutes.
    expect(screen.getByRole("button", { name: /^next set$/i })).toBeTruthy()
  })

  it("says at the summary when the record keeps no new answers (Rem. 4.18)", () => {
    render(
      <LensSession
        deck={REPO_LENS}
        level={1}
        speech={null}
        seedKey={() => "full"}
        recordFull={() => true}
        onExit={() => undefined}
      />
    )
    for (let step = 0; step < 60; step += 1) {
      if (document.querySelector('[data-slot="lens-summary"]')) break
      expect(screen.queryByText(/record is full/i)).toBeNull()
      answerCard()
    }
    expect(screen.getByText(/record is full/i)).toBeTruthy()
  })

  it("reads every cue where nothing can speak", () => {
    render(
      <LensSession
        deck={REPO_LENS}
        level={1}
        speech={null}
        seedKey={() => "cues"}
        onExit={() => undefined}
      />
    )
    let shown = 0
    for (let step = 0; step < 60; step += 1) {
      const card = document.querySelector('[data-slot="lens-card"]')
      if (!card) break
      if (card.getAttribute("data-phase") === "item") {
        expect(screen.queryByRole("button", { name: /play a/i })).toBeNull()
        const cue = document.querySelector('[data-slot="lens-cue"]')
        if (cue) {
          shown += 1
          expect(cue.querySelector("p[lang=ko]")?.textContent).toBeTruthy()
        }
      }
      answerCard()
    }
    expect(shown).toBeGreaterThan(0)
  })

  it("shows the line as answered through the step-down, never the form as written (Rem. 4.15)", () => {
    render(
      <LensSession
        deck={REPO_LENS}
        level={1}
        speech={null}
        seedKey={() => "step-down"}
        onExit={() => undefined}
      />
    )
    let checked = 0
    let picked = 0
    for (let step = 0; step < 80; step += 1) {
      const card = document.querySelector('[data-slot="lens-card"]')
      if (!card) break
      if (card.getAttribute("data-phase") === "item") {
        // A wrong answer: a misform when picking, at times, and "Looks
        // right" otherwise.
        const pick = Array.from(document.querySelectorAll("button[lang=ko]"))
        const fine = screen.queryByRole("button", { name: "Looks right" })
        const line = document.querySelector('[data-slot="lens-line"]')
        const open = line?.querySelector('[data-slot="lens-open"]')?.textContent
        // Which candidate is wrong is not on screen, so the choice varies;
        // the seed is fixed, and `picked` checks some pick is missed. Its
        // open word then shows the form chosen.
        const tap = pick[(step + 1) % Math.max(pick.length, 1)]
        const chosen = tap?.textContent
        const answered =
          !fine && open && chosen ? `${open.trimEnd()}${chosen}` : null
        const before = line?.textContent ?? ""
        fireEvent.click(fine ?? tap ?? document.body)
        if (card.getAttribute("data-phase") === "step-down") {
          checked += 1
          expect(screen.getByText(/not this one/i)).toBeTruthy()
          expect(
            document.querySelector('[data-slot="lens-line"]')?.textContent
          ).toBe(open && answered ? before.replace(open, answered) : before)
          if (answered) picked += 1
          expect(document.querySelector('[data-slot="lens-reveal"]')).toBeNull()
        }
        continue
      }
      answerCard()
    }
    expect(checked).toBeGreaterThan(picked)
    expect(picked).toBeGreaterThan(0)
  })

  it("holds a sitting begun while the host session is paused", () => {
    vi.useFakeTimers()
    render(
      <LensSession
        deck={REPO_LENS}
        level={1}
        speech={null}
        paused
        seedKey={() => "held"}
        onExit={() => undefined}
      />
    )
    expect(screen.getByText("Paused")).toBeTruthy()
    // Held two minutes on screen, the sitting ends (Rem. 4.10).
    act(() => {
      vi.advanceTimersByTime(MAX_SCREEN_MS)
    })
    fireEvent.click(screen.getByRole("button", { name: /keep going/i }))
    expect(screen.getByText("Paused")).toBeTruthy()
    expect(document.querySelector('[data-slot="lens-card"]')).toBeNull()
  })

  it("ends when the summary's two minutes run out", () => {
    vi.useFakeTimers()
    const onExit = vi.fn()
    render(
      <LensSession
        deck={REPO_LENS}
        level={1}
        speech={null}
        seedKey={() => "exit"}
        onExit={onExit}
      />
    )
    for (let step = 0; step < 60; step += 1) {
      if (document.querySelector('[data-slot="lens-summary"]')) break
      answerCard()
    }
    vi.advanceTimersByTime(MAX_SCREEN_MS)
    expect(onExit).toHaveBeenCalledOnce()
  })

  it("offers a take on the reveal, and records how many were kept, never the audio", () => {
    const takes = fakeTakes()
    const entries: Array<LensRecordEntry> = []
    render(
      <LensSession
        deck={REPO_LENS}
        level={1}
        speech={null}
        seedKey={() => "takes"}
        onExit={() => undefined}
        takes={takes}
        record={(entry) => entries.push(entry)}
      />
    )
    expect(
      screen.queryByRole("button", { name: /record yourself/i })
    ).toBeNull()
    while (
      document
        .querySelector('[data-slot="lens-card"]')
        ?.getAttribute("data-phase") !== "reveal"
    ) {
      answerCard()
    }
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /record yourself/i }))
    })
    expect(screen.getByRole("button", { name: /stop/i })).toBeTruthy()
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /stop/i }))
    })
    expect(screen.getByRole("button", { name: /mine 2\.5s/i })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /^again$/i }))
    fireEvent.click(screen.getByRole("button", { name: /stop/i }))
    answerCard()
    expect(takes.started).toHaveLength(2)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      line: takes.started[0],
      take: { count: 2, lastMs: 2_500, heardFirst: false },
    })
    expect(screen.queryByRole("button", { name: /mine/i })).toBeNull()
  })

  it("offers no take once the takes are full, and says how to make room (Rem. 4.16)", () => {
    const takes = fakeTakes({ full: true })
    render(
      <LensSession
        deck={REPO_LENS}
        level={1}
        speech={null}
        seedKey={() => "takes"}
        onExit={() => undefined}
        takes={takes}
      />
    )
    while (
      document
        .querySelector('[data-slot="lens-card"]')
        ?.getAttribute("data-phase") !== "reveal"
    ) {
      answerCard()
    }
    const button = screen.getByRole("button", { name: /no room for a take/i })
    expect(button.hasAttribute("disabled")).toBe(true)
    expect(screen.getByRole("status").textContent).toMatch(/make room/i)
  })
})
