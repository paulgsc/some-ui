import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { RationaleChoice } from "@leetype/types/exercise"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { RationaleAccordion } from "."

function sourceOf(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf-8"
  )
}

const candidates: ReadonlyArray<RationaleChoice> = [
  { text: "borrowing avoids the copy" },
  { text: "the iterator adaptor never allocates", canonical: true },
]

function typeInto(input: HTMLElement, text: string): void {
  for (const key of text) {
    fireEvent.keyDown(input, { key })
  }
}

async function open(): Promise<HTMLElement> {
  const trigger = screen.getByText("Why is this the right fix?")
  fireEvent.click(trigger)
  return screen.findByLabelText("Type a candidate rationale")
}

describe("RationaleAccordion", () => {
  it("renders closed, with no candidate visible until opened", () => {
    render(<RationaleAccordion candidates={candidates} />)
    expect(screen.getByText("Why is this the right fix?")).toBeInTheDocument()
    expect(
      screen.queryByText(candidates[0]?.text ?? "")
    ).not.toBeInTheDocument()
  })

  it("shows every candidate once opened", async () => {
    render(<RationaleAccordion candidates={candidates} />)
    await open()
    for (const candidate of candidates) {
      expect(screen.getByText(candidate.text)).toBeInTheDocument()
    }
  })

  it("narrows as the player types, eliminating candidates that no longer match", async () => {
    render(<RationaleAccordion candidates={candidates} />)
    const input = await open()
    typeInto(input, "the iterator")
    // Still present, but its counterpart is now the only live candidate.
    expect(screen.getByText(/borrowing avoids the copy/)).toBeInTheDocument()
  })

  it("shows a neutral acknowledgement on completing any candidate — no verdict language", async () => {
    render(<RationaleAccordion candidates={candidates} />)
    const input = await open()
    const target = candidates[0]
    if (!target) throw new Error("fixture has two candidates")
    typeInto(input, target.text)
    expect(screen.getByText("Noted.")).toBeInTheDocument()
    expect(screen.queryByText(/correct/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/incorrect/i)).not.toBeInTheDocument()
  })

  it("stops accepting keystrokes once a candidate is completed", async () => {
    render(<RationaleAccordion candidates={candidates} />)
    const input = await open()
    const target = candidates[0]
    if (!target) throw new Error("fixture has two candidates")
    typeInto(input, target.text)
    typeInto(input, " and then some")
    // A second "Noted." would mean input kept being accepted post-completion.
    expect(screen.getAllByText("Noted.")).toHaveLength(1)
  })

  it("renders an actionable dead end when nothing matches, and Clear restores every candidate", async () => {
    render(<RationaleAccordion candidates={candidates} />)
    const input = await open()
    typeInto(input, "zzz-not-a-prefix-of-anything")
    expect(
      screen.getByText("Nothing here matches anymore.")
    ).toBeInTheDocument()

    fireEvent.click(screen.getByText("Clear and try again"))
    for (const candidate of candidates) {
      expect(screen.getByText(candidate.text)).toBeInTheDocument()
    }
    expect(
      screen.queryByText("Nothing here matches anymore.")
    ).not.toBeInTheDocument()
  })

  it("supports backspace narrowing back out — no separate undo path", async () => {
    render(<RationaleAccordion candidates={candidates} />)
    const input = await open()
    typeInto(input, "the iterator")
    fireEvent.keyDown(input, { key: "Backspace" })
    fireEvent.keyDown(input, { key: "Backspace" })
    // Back to "the itera" — still only one live candidate, nothing thrown.
    expect(screen.getByText(/borrowing avoids the copy/)).toBeInTheDocument()
  })

  it("starts fresh when the caller remounts it via a new key — the reset mechanism callers rely on", async () => {
    // This component carries no step-identity prop of its own (see its own
    // doc comment): a caller resets it by mounting a fresh instance with
    // `key={stepKey}`, the same way `Leetype` does. Same `candidates` on
    // both renders on purpose — proves the reset comes from the remount
    // itself, not from a coincidental mismatch between old `typed` and a
    // changed candidate set.
    const { rerender } = render(
      <RationaleAccordion key="step-a" candidates={candidates} />
    )
    const input = await open()
    const target = candidates[0]
    if (!target) throw new Error("fixture has two candidates")
    typeInto(input, target.text)
    expect(screen.getByText("Noted.")).toBeInTheDocument()

    rerender(<RationaleAccordion key="step-b" candidates={candidates} />)
    expect(screen.queryByText("Noted.")).not.toBeInTheDocument()
    expect(screen.getByText("Why is this the right fix?")).toBeInTheDocument()
  })
})

describe("RationaleAccordion stays free of verdict language and the engine's vocabulary", () => {
  it("never spells out correct/incorrect in its own source", () => {
    const source = sourceOf("./index.tsx")
    expect(source).not.toMatch(/\bcorrect\b/i)
    expect(source).not.toMatch(/\bincorrect\b/i)
    expect(source).not.toMatch(/\bwrong\b/i)
  })

  it("imports nothing from types/leetype's engine vocabulary, the wasm hook, or the wasm package", () => {
    const source = sourceOf("./index.tsx")
    expect(source).not.toMatch(/@leetype\/types\/leetype/)
    expect(source).not.toMatch(/use-typing-game-wasm/)
    expect(source).not.toMatch(/@some-ui\/leetype-wasm/)
    expect(source).not.toMatch(/localStorage/)
  })
})
