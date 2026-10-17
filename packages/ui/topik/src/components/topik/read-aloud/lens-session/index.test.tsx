import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { LensSession } from "@topik/components/topik/read-aloud/lens-session"
import { MISTAKES } from "@topik/lib/topik/read-aloud/mistakes"
import { REPO_SETS } from "@topik/lib/topik/read-aloud/repo-sets"
import { MAX_SCREEN_MS } from "@topik/lib/topik/read-aloud/timing"
import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

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
        deck={REPO_SETS}
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
      ...REPO_SETS.lines.map((line) => line.english),
      ...REPO_SETS.words.map((word) => word.gloss),
      ...REPO_SETS.lines.flatMap((line) =>
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
  })

  it("reads every cue where nothing can speak", () => {
    render(
      <LensSession
        deck={REPO_SETS}
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
        deck={REPO_SETS}
        level={1}
        speech={null}
        seedKey={() => "step-down"}
        onExit={() => undefined}
      />
    )
    let checked = 0
    for (let step = 0; step < 80; step += 1) {
      const card = document.querySelector('[data-slot="lens-card"]')
      if (!card) break
      if (card.getAttribute("data-phase") === "item") {
        // A wrong answer: a misform when picking, "Looks right" otherwise.
        const pick = Array.from(document.querySelectorAll("button[lang=ko]"))
        const fine = screen.queryByRole("button", { name: "Looks right" })
        const line = document.querySelector('[data-slot="lens-line"]')
        const before = line?.textContent ?? ""
        fireEvent.click(fine ?? pick[0] ?? document.body)
        if (card.getAttribute("data-phase") === "step-down") {
          checked += 1
          expect(screen.getByText(/not this one/i)).toBeTruthy()
          expect(
            document.querySelector('[data-slot="lens-line"]')?.textContent
          ).toBe(before)
          expect(document.querySelector('[data-slot="lens-reveal"]')).toBeNull()
        }
        continue
      }
      answerCard()
    }
    expect(checked).toBeGreaterThan(0)
  })

  it("ends when the summary's two minutes run out", () => {
    vi.useFakeTimers()
    const onExit = vi.fn()
    render(
      <LensSession
        deck={REPO_SETS}
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
})
