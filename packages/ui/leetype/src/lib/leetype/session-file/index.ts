import type {
  ChoiceScreen,
  SessionFile,
  SessionScreen,
} from "@leetype/types/session-file"
import { edgesOf } from "@leetype/types/session-file"
import { assertNever, mentionsWord } from "@some-ui/core-utils"

/**
 * The content lint for a session file (canon v1.2, Rem. 10.3, Prop. 9.4,
 * Prop. 10.2). Each rule is mechanical over the file; none says whether a
 * citation or a reason is *true*, which needs the expert review pass.
 * `unglossed-term` reports a screen that uses a glossary term when some path
 * to it from the start or from a return, the screen included, glosses it
 * nowhere. `feedback-names-answer` matches the correct label as words, so a
 * paraphrase of the answer is for the review pass to catch. A reading is
 * placed when a struggle can reach it or it is tagged `placement`; its in-app
 * core is its passage, read at `WORDS_PER_MINUTE`.
 */

type SessionFileFindingCode =
  | "round-without-abstention"
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
/** Dense technical prose on a phone, the brief's reading-time estimate. */
const WORDS_PER_MINUTE = 150

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
      parts.push(...(screen.actions ?? []).map((action) => action.label))
      break
    }
    default: {
      return assertNever(screen)
    }
  }
  return parts.filter((part) => part !== undefined).join("\n")
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
  // A slow pick is a struggle even when correct (Def. 9.4); with no
  // `onHesitate` it goes where the correct option goes.
  const slow =
    screen.onHesitate ?? screen.options.find((option) => option.correct)?.next
  const targets = new Set(
    screen.options.filter((option) => !option.correct).map((o) => o.next)
  )
  if (slow !== undefined) targets.add(slow)
  return [...targets].map((to) => ({ from: id, to }))
}

/**
 * Whether every walk from `start` reaches a reading before any choice,
 * record or end; `info` screens are passed through. A cycle of info
 * screens, or an info action that leaves the session, counts as a miss.
 * Each reading the walk reaches is added to `placed`.
 */
function alwaysReachesReading(
  file: SessionFile,
  start: string,
  placed: Set<string>
): boolean {
  const visiting = new Set<string>()
  const walk = (id: string): boolean => {
    const screen = file.screens[id]
    if (!screen) return false
    if (screen.type === "reading") {
      placed.add(id)
      return true
    }
    if (screen.type !== "info" || visiting.has(id)) return false
    if (screen.actions.some((action) => !action.next)) return false
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
  const returns = Object.entries(file.screens).flatMap(([id, screen]) =>
    screen.type === "choice" && screen.returnOf !== undefined ? [id] : []
  )
  const queue = [file.start, ...returns]
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

  const placed = new Set<string>()
  for (const [id, screen] of Object.entries(file.screens)) {
    if (isRound(screen)) {
      if (!screen.options.some((option) => option.abstain)) {
        add(
          "round-without-abstention",
          id,
          "the round has no abstention, which Def. 9.1 requires"
        )
      }
      if (screen.cites === undefined) {
        add(
          "uncited-round",
          id,
          "the round cites no reading whose passage answers it (`cites`)"
        )
      }
      const correct = screen.options.find((option) => option.correct)
      for (const option of screen.options) {
        if (option.correct || !option.feedback || !correct) continue
        if (mentionsWord(option.feedback, correct.label)) {
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
      if (!alwaysReachesReading(file, edge.to, placed)) {
        add(
          "struggle-without-reading",
          edge.from,
          `a struggle leading to "${edge.to}" can go on without a placed reading`
        )
      }
    }

    if (screen.type === "reading" && screen.tags?.includes("placement")) {
      placed.add(id)
    }

    if (
      screen.type === "end" &&
      (screen.body !== undefined || screen.title !== undefined)
    ) {
      add(
        "authored-ledger",
        id,
        "the end screen's ledger is derived from the session's events, never written ahead"
      )
    }
  }

  for (const id of placed) {
    const reading = file.screens[id]
    if (reading?.type !== "reading") continue
    const words = (reading.passage ?? "").split(/\s+/).filter(Boolean).length
    const minutes = Math.ceil(words / WORDS_PER_MINUTE)
    if (minutes > PLACEMENT_CORE_MINUTES) {
      add(
        "long-placement",
        id,
        `a placed reading's in-app core takes about ${String(minutes)} minutes; it takes ${String(PLACEMENT_CORE_MINUTES)} or less`
      )
    }
  }

  for (const term of Object.keys(file.glossary ?? {})) {
    for (const id of reachableUnglossed(file, term)) {
      const screen = file.screens[id]
      const text = screen ? textOf(screen) : ""
      if (mentionsWord(text, term) || mentionsWord(text, `${term}s`)) {
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
