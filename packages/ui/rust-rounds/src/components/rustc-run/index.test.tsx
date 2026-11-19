/**
 * rustc's result on the phone (RR23, #3243): a compile error with rustc's
 * JSON is laid out in rustc's words, with nothing it said left off the
 * screen, and its printout folded beneath; one from a home older than RR23
 * shows the printout alone, whole.
 */
import { RunView } from "@rust-rounds/components/rustc-run"
import type { Diagnostic, DiagnosticSpan } from "@rust-rounds/lib/formats"
import { WORDS } from "@rust-rounds/lib/play/words"
import {
  E0382,
  E0382_PROGRAM,
  E0507,
  E0507_PROGRAM,
} from "@rust-rounds/lib/rustc-view/fixture"
import { INDEXING_01_RUNS } from "@rust-rounds/lib/worked-example"
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

const E0277 = INDEXING_01_RUNS["a"]
if (E0277?.outcome !== "compile-error") {
  throw new Error("the worked example's card a is rustc's E0277")
}

/** What rustc said, in the order a reader meets it: messages, then labels. */
function everythingSaid(diagnostics: ReadonlyArray<Diagnostic>): Array<string> {
  const labels = (spans: ReadonlyArray<DiagnosticSpan>): Array<string> =>
    spans.flatMap((span) => (span.label === null ? [] : [span.label]))
  return diagnostics.flatMap((diagnostic) => [
    diagnostic.message,
    ...labels(diagnostic.spans),
    ...diagnostic.children.flatMap((child) => [
      child.message,
      ...labels(child.spans),
    ]),
  ])
}

describe("RunView, a compile error", () => {
  it.each([
    ["E0277", E0277, null],
    ["E0507", E0507, E0507_PROGRAM],
    ["E0382", E0382, E0382_PROGRAM],
  ] as const)(
    "puts on screen every message and labelled span of rustc's JSON for %s, in order",
    (_, run, program) => {
      render(<RunView run={run} program={program} none="" />)
      const said = screen.getByRole("figure", { name: WORDS.rustcSaid })
      const text = said.textContent
      let from = 0
      for (const words of everythingSaid(run.diagnostics ?? [])) {
        // Labels of one diagnostic follow its line order, not the JSON's,
        // so each is looked for after its diagnostic's message.
        const at = text.indexOf(words)
        expect(at, words).toBeGreaterThanOrEqual(0)
        if (
          (run.diagnostics ?? []).some(
            (diagnostic) => diagnostic.message === words
          )
        ) {
          expect(at, words).toBeGreaterThanOrEqual(from)
          from = at
        }
      }
      // rustc's heading and location, as it prints them.
      const [first] = run.diagnostics ?? []
      expect(text).toContain(
        `error[${run.code ?? ""}]: ${first?.message ?? ""}`
      )
      expect(text).toContain(`--> main.rs:${String(run.span?.lineStart)}:`)
    }
  )

  it("marks the suggestion's new text in its card", () => {
    render(<RunView run={E0507} program={E0507_PROGRAM} none="" />)
    const fix = screen.getByRole("figure", { name: WORDS.rustcSuggested })
    expect(fix.querySelector("[data-code-inserted]")?.textContent).toBe("&")
    expect(fix.querySelector('[data-code-gutter="9"]')?.textContent).toContain(
      "+"
    )
  })

  it("folds rustc's printout, whole, under what it printed", () => {
    const { container } = render(
      <RunView run={E0507} program={E0507_PROGRAM} none="" />
    )
    const details = container.querySelector("details")
    expect(details?.open).toBe(false)
    expect(within(details!).getByText(WORDS.rustcPrinted).tagName).toBe(
      "SUMMARY"
    )
    expect(details?.querySelector("pre")?.textContent).toBe(E0507.stderr)
  })

  it("shows a run from a home older than RR23 as printed, whole, and nothing laid out", () => {
    const { diagnostics: _, ...older } = E0507
    const { container } = render(
      <RunView run={older} program={E0507_PROGRAM} none="" />
    )
    expect(screen.queryByRole("figure", { name: WORDS.rustcSaid })).toBeNull()
    expect(container.querySelector("details")).toBeNull()
    expect(screen.getByText(WORDS.rustcPrinted)).toBeVisible()
    expect(container.querySelector("pre")?.textContent).toBe(older.stderr)
  })
})
