import type {
  ChoiceScreen,
  SessionFile,
  SessionScreen,
} from "@leetype/types/session-file"
import { edgesOf } from "@leetype/types/session-file"
import { assertNever } from "@some-ui/core-utils"

/**
 * The content lint for a session file (canon v1.2, Rem. 10.3, Prop. 9.4,
 * Prop. 10.2). Each rule is mechanical over the file; none says whether a
 * citation or a reason is *true*, which needs the expert review pass.
 *
 * - `uncited-round`: a round (a choice with a correct option) has no `cites`.
 * - `struggle-without-reading`: a struggle edge (a wrong pick, the
 *   abstention, `onHesitate`, a record's `onWeak`) can reach a choice, a
 *   record or the end without first reaching a reading.
 * - `feedback-names-answer`: a wrong option's or the abstention's feedback
 *   contains the correct option's label.
 * - `unglossed-term`: a screen uses a glossary term that no screen on some
 *   path to it, itself included, glosses.
 * - `long-placement`: a placed reading's source takes more than three
 *   minutes (Prop. 9.4 (a)).
 * - `verbatim-return`: a return repeats the round it returns (Prop. 9.4 (b)).
 * - `authored-ledger`: the end screen carries authored body text (Prop. 10.2).
 */

type SessionFileFindingCode =
  | "uncited-round"
  | "struggle-without-reading"
  | "feedback-names-answer"
  | "unglossed-term"
  | "long-placement"
  | "verbatim-return"
  | "authored-ledger"

export type SessionFileFinding = {
  readonly code: SessionFileFindingCode
  readonly screen: string
  readonly message: string
}

const PLACEMENT_CORE_MINUTES = 3

function isRound(screen: SessionScreen): screen is ChoiceScreen {
  return (
    screen.type === "choice" && screen.options.some((option) => option.correct)
  )
}

function normalized(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim()
}

/** Every string a learner reads on `screen`. */
function textOf(screen: SessionScreen): string {
  const parts = [screen.title, screen.pinned, screen.body]
  switch (screen.type) {
    case "choice": {
      parts.push(
        screen.provenance,
        ...screen.options.flatMap((o) => [o.label, o.feedback]),
        ...(screen.panel?.rows.flatMap((r) => [r.who, r.holds]) ?? [])
      )
      break
    }
    case "record": {
      parts.push(screen.prompt, ...screen.rubric)
      break
    }
    case "reading": {
      parts.push(screen.primer, screen.passage)
      break
    }
    case "info":
    case "end": {
      break
    }
    default: {
      return assertNever(screen)
    }
  }
  return parts.filter((part) => part !== undefined).join("\n")
}

function mentions(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`,
    "iu"
  ).test(text)
}

/** The screens a struggle edge lands on, with the screen it leaves. */
function struggleEdges(
  id: string,
  screen: SessionScreen
): Array<{ from: string; to: string }> {
  if (screen.type === "record") {
    return screen.onWeak ? [{ from: id, to: screen.onWeak }] : []
  }
  if (!isRound(screen)) return []
  const edges = screen.options
    .filter((option) => !option.correct)
    .map((option) => ({ from: id, to: option.next }))
  if (screen.onHesitate) edges.push({ from: id, to: screen.onHesitate })
  return edges
}

/**
 * Whether every walk from `start` reaches a reading before any choice,
 * record or end; `info` screens are passed through. A cycle of info
 * screens reaches nothing, so it counts as a miss.
 */
function alwaysReachesReading(file: SessionFile, start: string): boolean {
  const visiting = new Set<string>()
  const walk = (id: string): boolean => {
    const screen = file.screens[id]
    if (!screen) return false
    if (screen.type === "reading") return true
    if (screen.type !== "info" || visiting.has(id)) return false
    visiting.add(id)
    const nexts = edgesOf(screen)
    const ok = nexts.length > 0 && nexts.every(walk)
    visiting.delete(id)
    return ok
  }
  return walk(start)
}

/**
 * Screens reachable from `start` without passing through a screen that
 * glosses `term`, which are therefore reached with `term` still undefined.
 */
function reachableUnglossed(file: SessionFile, term: string): Set<string> {
  const reached = new Set<string>()
  const queue = [file.start]
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    const screen = file.screens[id]
    if (!screen || reached.has(id)) continue
    if (screen.glosses?.includes(term)) continue
    reached.add(id)
    queue.push(...edgesOf(screen))
  }
  return reached
}

export function lintSessionFile(file: SessionFile): Array<SessionFileFinding> {
  const findings: Array<SessionFileFinding> = []
  const add = (
    code: SessionFileFindingCode,
    screen: string,
    message: string
  ): void => {
    findings.push({ code, screen, message })
  }

  for (const [id, screen] of Object.entries(file.screens)) {
    if (isRound(screen)) {
      if (screen.cites === undefined) {
        add(
          "uncited-round",
          id,
          "the round cites no reading whose passage answers it (`cites`)"
        )
      }
      const correct = screen.options.find((option) => option.correct)
      const answer = correct ? normalized(correct.label) : ""
      for (const option of screen.options) {
        if (option.correct || !option.feedback) continue
        if (answer && normalized(option.feedback).includes(answer)) {
          add(
            "feedback-names-answer",
            id,
            `the feedback on "${option.label}" names the correct option`
          )
        }
      }
      if (screen.returnOf !== undefined) {
        const original = file.screens[screen.returnOf]
        if (
          original &&
          normalized(original.body ?? "") === normalized(screen.body ?? "")
        ) {
          add(
            "verbatim-return",
            id,
            `the return repeats ${screen.returnOf}'s situation; it needs new numbers or a new case`
          )
        }
      }
    }

    for (const edge of struggleEdges(id, screen)) {
      if (!alwaysReachesReading(file, edge.to)) {
        add(
          "struggle-without-reading",
          edge.from,
          `a struggle leading to "${edge.to}" can go on without a placed reading`
        )
      }
    }

    if (
      screen.type === "reading" &&
      screen.tags?.includes("placement") &&
      screen.source.minutes > PLACEMENT_CORE_MINUTES
    ) {
      add(
        "long-placement",
        id,
        `a placed reading takes ${String(screen.source.minutes)} minutes; its in-app core takes ${String(PLACEMENT_CORE_MINUTES)} or less`
      )
    }

    if (screen.type === "end" && screen.body !== undefined) {
      add(
        "authored-ledger",
        id,
        "the end screen's ledger is derived from the session's events, never written ahead"
      )
    }
  }

  for (const term of Object.keys(file.glossary ?? {})) {
    for (const id of reachableUnglossed(file, term)) {
      const screen = file.screens[id]
      if (screen && mentions(textOf(screen), term)) {
        add(
          "unglossed-term",
          id,
          `"${term}" is used here before any screen on the way glosses it`
        )
      }
    }
  }

  return findings
}
