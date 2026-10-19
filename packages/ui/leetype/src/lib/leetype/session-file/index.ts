import type { RuleId } from "@leetype/lib/leetype/proposition-register/generated"
import { RULE_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import { ruleRegisterOf } from "@leetype/lib/leetype/proposition-register/parse-canon"
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
 * core is its passage, read at `WORDS_PER_MINUTE`. `unregistered-rule`
 * resolves every `rule` and `applies` against Rem. 7.4's registers
 * (Rem. 7.1's citation check over `M` and `A`).
 *
 * Rem. 10.3 (5) spans files, so it is not here: `negativeDiscriminationGaps`
 * takes the whole set.
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
  | "unregistered-rule"

export type SessionFileFinding = {
  readonly code: SessionFileFindingCode
  readonly screen: string
  readonly message: string
}

const PLACEMENT_CORE_MINUTES = 3
/** Dense technical prose on a phone, the brief's reading-time estimate. */
const WORDS_PER_MINUTE = 150

function isRuleId(id: string): id is RuleId {
  return Object.hasOwn(RULE_REGISTER, id)
}

/** Why `id` does not resolve to a live Rem. 7.4 row, or null when it does. */
function unregistered(id: string): string | null {
  const table = `canon Rem. 7.4's ${ruleRegisterOf(id)} register`
  if (!isRuleId(id)) return `"${id}" is in no row of ${table}`
  if (RULE_REGISTER[id].status === "superseded") {
    return `"${id}" is superseded in ${table}; cite the row that replaces it`
  }
  return null
}

export function isRound(screen: SessionScreen): screen is ChoiceScreen {
  return (
    screen.type === "choice" && screen.options.some((option) => option.correct)
  )
}

function normalized(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim()
}

/** What a round's numbers live in: its body and its who-holds-what panel. */
function situationOf(screen: ChoiceScreen): string {
  return normalized(
    [
      screen.body ?? "",
      ...(
        screen.panel?.rows.map((row) => `${row.who}: ${row.holds}`) ?? []
      ).sort(),
    ].join("\n")
  )
}

/** Every string a learner reads on `screen`. */
function textOf(screen: SessionScreen): string {
  const parts = [screen.title, screen.pinned, screen.body]
  switch (screen.type) {
    case "choice": {
      parts.push(
        screen.provenance,
        screen.panel?.title,
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
      parts.push(
        screen.primer,
        screen.passage,
        ...screen.actions.map((action) => action.label)
      )
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

/** A term and its English plurals, so "quorum" also finds "quorums". */
function formsOf(term: string): Array<string> {
  const forms = [term, `${term}s`, `${term}es`]
  if (term.endsWith("y")) forms.push(`${term.slice(0, -1)}ies`)
  return forms
}

/** The screens a struggle edge lands on, with the screen it leaves. */
function struggleEdges(
  id: string,
  screen: SessionScreen
): Array<{ from: string; to: string; how: string }> {
  if (screen.type === "record") {
    return screen.onWeak
      ? [{ from: id, to: screen.onWeak, how: "a weak spoken answer" }]
      : []
  }
  if (!isRound(screen)) return []
  // A slow pick is a struggle even when correct (Def. 9.4); with no
  // `onHesitate` it goes where the correct option goes.
  const slow =
    screen.onHesitate ?? screen.options.find((option) => option.correct)?.next
  const targets = new Map<string, string>()
  for (const option of screen.options) {
    if (!option.correct) targets.set(option.next, "a wrong pick or Not sure")
  }
  if (slow !== undefined && !targets.has(slow)) {
    targets.set(
      slow,
      screen.onHesitate ? "a slow pick" : "a slow pick (no onHesitate)"
    )
  }
  return [...targets].map(([to, how]) => ({ from: id, to, how }))
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
    const reached = edgesOf(screen).map(walk)
    const ok = reached.length > 0 && reached.every(Boolean)
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
  // A return is played after its round, in this session or a later one.
  const returnsOf = new Map<string, Array<string>>()
  for (const [id, screen] of Object.entries(file.screens)) {
    if (screen.type === "choice" && screen.returnOf !== undefined) {
      returnsOf.set(screen.returnOf, [
        ...(returnsOf.get(screen.returnOf) ?? []),
        id,
      ])
    }
  }
  const queue = [file.start]
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    const screen = file.screens[id]
    if (!screen || reached.has(id)) continue
    if (screen.glosses?.includes(term)) continue
    reached.add(id)
    queue.push(...edgesOf(screen), ...(returnsOf.get(id) ?? []))
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
    if (screen.type === "choice") {
      const cited = [
        screen.rule,
        ...screen.options.map((option) => option.applies),
      ]
      for (const rule of new Set(cited)) {
        const why = rule === undefined ? null : unregistered(rule)
        if (why !== null) add("unregistered-rule", id, why)
      }
    }

    if (isRound(screen)) {
      const abstentions = screen.options.filter((option) => option.abstain)
      if (abstentions.length !== 1) {
        add(
          "round-without-abstention",
          id,
          "a round has exactly one abstention (Def. 9.1)"
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
          original?.type === "choice" &&
          situationOf(original) === situationOf(screen)
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
          `${edge.how} leads to "${edge.to}", which can go on without a placed reading`
        )
      }
    }

    if (screen.type === "reading" && screen.tags?.includes("placement")) {
      placed.add(id)
    }

    if (
      screen.type === "end" &&
      (screen.body !== undefined ||
        screen.title !== undefined ||
        screen.pinned !== undefined)
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
      if (formsOf(term).some((form) => mentionsWord(text, form))) {
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

/**
 * Rem. 10.3 (5) over a set of session files: every live `M` or `A` entry
 * that is no option's `applies` on any round another entry decides, so a
 * learner who always picks it is never shown wrong (Prop. 10.1). The canon
 * marks no entry uninstantiable, so every live row is owed one.
 */
export function negativeDiscriminationGaps(
  files: ReadonlyArray<SessionFile>
): Array<RuleId> {
  const discriminated = new Set<string>()
  for (const file of files) {
    for (const screen of Object.values(file.screens)) {
      if (!isRound(screen)) continue
      for (const option of screen.options) {
        if (option.applies !== undefined && option.applies !== screen.rule) {
          discriminated.add(option.applies)
        }
      }
    }
  }
  return Object.values(RULE_REGISTER)
    .filter((entry) => entry.status === "active")
    .map((entry) => entry.id)
    .filter(isRuleId)
    .filter((id) => !discriminated.has(id))
}
