// What the policy documents' text can hold (CLAUDE.md, "Gray-area invariants:
// declare them falsifiable"), as pure functions over markdown text.
// `scripts/check-policy-docs.ts` runs them over every tracked `*.md`.
//
// Invariant declarations, in any markdown file, outside fenced code. A
// declaration is a line that starts, after any `>` quote markers, with
// `**<ID>:`, `**<ID> (not reviewable):` or `**<ID> (retired):`, with a space
// after the colon (a bold `- **ID:**` list item is not one). Its block runs to
// the next declaration or heading.
// - An active one has a line starting `_Claim:_`, `_Falsified by_`,
//   `_Scope:_` and `_Why not …:_` (`enforced`, `lint or tests`, `wholly
//   enforced`). One marked `(not reviewable)` needs none: no diff can falsify
//   it. A retired one has a `_Retired:_` line giving the reason.
// - An ID is declared once across the repo (`QUOTED_COPIES` is the one
//   exception), and an ID declared at the base ref, read the same way, is still
//   declared: a renumbered or dropped one fails, a moved one does not. A new
//   claim under an old ID shows as neither: that is review's.
//
// References, in the policy documents (`POLICY_DOCS`), outside fenced code:
// - a backticked path under a top-level directory names a tracked file or
//   directory, by its full path;
// - any other backticked path ending in a file extension names a tracked file
//   by a `/`-suffix of its path (a bare basename included), the way a doc
//   inside a package writes a path relative to it;
// - `` `file.md`, "Heading" `` (a comma, `→` or `->` between them, line breaks
//   allowed) names a heading in that file, whole or up to its first `: `
//   ("Two kinds of pull request" for "Two kinds of pull request: the story
//   moved, or a promise broke").
//
// Debt, in any markdown file's declaration blocks (#2047): the label
// "mechanical; not yet a rule" (also with a comma or "and", across line breaks
// and quote markers) needs a `Tracked: #<issue>` in the same block, and the
// tree holds no more of them than the base ref does. A label outside a
// declaration describes the format and is not counted.
//
// Held by, in the policy documents (#2046): a line `Held by: \`pnpm
// check:<name>\`` says a check holds the rule it sits under. The script is in
// the root package.json, and a pr.yml job CI Gate needs runs it (as `pnpm
// check:<name>` or by the file its script runs), so removing or unwiring the
// check fails the change that does it. A lint rule or a type is held by its
// config, which the rule's own text names; the line is for check scripts.
//
// The review digest (#2048): AGENTS.md's "Review guidelines" restates
// REVIEW.md for Codex. Each REVIEW.md `##` section has one bullet there whose
// bold lead begins with the section's heading, and the two name the same
// `check:*` scripts and backticked invariant IDs; no bullet is left over.
// A path in another repository is listed in `FOREIGN_PATHS`; an entry no
// policy document uses fails, so the list only shrinks with the prose. A path
// that is ignored or generated is not tracked: write it without backticks.
//
// A script, not an ESLint rule, for test-layout.ts's reason: both checks read
// other files. Lexical, like workflow-guards.ts: each rule accepts a closed
// shape. Whether a falsifier is decidable and a claim true stays review's.

const POLICY_DOCS: ReadonlyArray<string> = [
  "CLAUDE.md",
  "REVIEW.md",
  "AGENTS.md",
]

/**
 * An ID's second declaration that is a quoted copy, not a second invariant:
 * ID -> the file that quotes it. The quote is skipped, so deleting the
 * authoritative declaration still shows as a removed ID.
 */
const QUOTED_COPIES: ReadonlyMap<string, string> = new Map([
  // CLAUDE.md quotes L3 as the worked example of the format and says
  // extensions/common/GOOD_CITIZEN.md holds the authoritative copy.
  ["L3", "CLAUDE.md"],
])

/** Paths the documents give in another repository: path -> that repository. */
const FOREIGN_PATHS: ReadonlyMap<string, string> = new Map([
  [".github/workflows/routes.yml", "paulgsc/server"],
  ["routes.yml", "paulgsc/server"],
  ["apps/servers/file_host/docs/route-inventory.md", "paulgsc/server"],
])

type Part = "claim" | "falsified" | "scope" | "whyNot" | "retired"

const PART_LINE: Readonly<Record<Part, RegExp>> = {
  claim: /^_Claim:?_/,
  falsified: /^_Falsified by:?_/,
  scope: /^_Scope:?_/,
  whyNot: /^_Why not\b[^_]*_/,
  retired: /^_Retired:?_\s*\S/,
}
const PART_LABEL: Readonly<Record<Part, string>> = {
  claim: "_Claim:_",
  falsified: "_Falsified by_",
  scope: "_Scope:_",
  whyNot: "_Why not enforced:_",
  retired: "_Retired:_ <reason>",
}
const ACTIVE_PARTS: ReadonlyArray<Part> = [
  "claim",
  "falsified",
  "scope",
  "whyNot",
]

const DECLARATION =
  /^[>\s]*\*\*(?<id>[A-Z]{1,4}\d+)(?: \((?<mark>not reviewable|retired)\))?:\s/
const HEADING = /^ {0,3}#{1,6}[ \t]+(?<text>.+?)(?:[ \t]+#+)?[ \t]*$/
const FENCE = /^[\s>]*(?<mark>`{3,}|~{3,})(?<rest>.*)$/
const SPAN = /`([^`\n]+)`/g
const HEADING_REF =
  /`(?<file>[\w./-]+\.md)`\s*(?:,|→|->)\s*"(?<heading>[^"]+)"/g
const FILE_EXTENSION =
  /\.(?:md|ts|tsx|js|jsx|mjs|cjs|json|jsonc|ya?ml|toml|sh|css|sql|typ|html|rs|allowlist|gradle|java|kt|xml|txt|lock)$/
const PATH_SHAPE = /^[\w.@-]+(?:\/[\w.@-]+)*$/

/** The debt label in its three spellings, whitespace and `>` between words. */
const DEBT_LABEL =
  /mechanical(?:[;,]|[\s>]+and)[\s>]+not[\s>]+yet[\s>]+a[\s>]+rule/gi
const TRACKED = /Tracked:[\s>]*#\d+/

const HELD_BY =
  /^[>\s]*(?:[-*]\s+)?Held by: `pnpm (?<name>check:[\w-]+)`\.?\s*$/
const JOB = /^ {2}(?<id>[\w-]+):\s*$/
const SCRIPT_FILE = /\bscripts\/[\w./-]+\.(?:ts|mjs|js|sh)\b/
const CHECK_NAME = /\bcheck:[\w-]+/g
const ID_SPAN = /`([A-Z]{1,4}\d+)`/g
const BULLET_LEAD = /^- \*\*(?<lead>[^*]+)\*\*/

export type PolicyViolation =
  | {
      readonly kind: "missingParts"
      readonly file: string
      readonly line: number
      readonly id: string
      readonly missing: ReadonlyArray<string>
    }
  | {
      readonly kind: "duplicateId"
      readonly file: string
      readonly line: number
      readonly id: string
      readonly first: string
    }
  | { readonly kind: "removedId"; readonly id: string }
  | {
      readonly kind: "staleQuote"
      readonly id: string
      readonly file: string
    }
  | { readonly kind: "missingPolicyDoc"; readonly file: string }
  | {
      readonly kind: "missingPath"
      readonly file: string
      readonly line: number
      readonly ref: string
    }
  | {
      readonly kind: "missingHeading"
      readonly file: string
      readonly line: number
      readonly target: string
      readonly heading: string
    }
  | { readonly kind: "staleForeign"; readonly path: string }
  | {
      readonly kind: "untrackedDebt"
      readonly file: string
      readonly line: number
      readonly id: string
    }
  | {
      readonly kind: "heldByUnwired"
      readonly file: string
      readonly line: number
      readonly name: string
      readonly why: "noScript" | "notInGate"
    }
  | { readonly kind: "gateUnreadable" }
  | {
      readonly kind: "digestMissing"
      readonly heading: string
    }
  | {
      readonly kind: "digestExtra"
      readonly lead: string
    }
  | {
      readonly kind: "digestDrift"
      readonly heading: string
      readonly only: "REVIEW.md" | "AGENTS.md"
      readonly names: ReadonlyArray<string>
    }
  | {
      readonly kind: "debtGrew"
      readonly count: number
      readonly base: number
    }

export type Declaration = {
  readonly id: string
  readonly file: string
  readonly line: number
  readonly missing: ReadonlyArray<Part>
}

function lines(text: string): Array<string> {
  return text.replace(/\r\n/g, "\n").split("\n")
}

/**
 * The text with fenced code blocks blanked, so line numbers still hold. As in
 * CommonMark, a fence closes only on the same character, at least as long as
 * the opening one and with nothing after it, so a longer fence can hold a
 * shorter one.
 */
function withoutFences(text: string): string {
  let open: { char: string; length: number } | null = null
  return lines(text)
    .map((line) => {
      const fence = FENCE.exec(line)?.groups
      const mark = fence?.["mark"]
      if (mark === undefined) return open === null ? line : ""
      if (open === null) {
        open = { char: mark.charAt(0), length: mark.length }
      } else if (
        mark.charAt(0) === open.char &&
        mark.length >= open.length &&
        (fence?.["rest"] ?? "").trim() === ""
      ) {
        open = null
      }
      return ""
    })
    .join("\n")
}

function lineAt(text: string, index: number): number {
  let line = 1
  for (let at = text.indexOf("\n"); at !== -1 && at < index; ) {
    line += 1
    at = text.indexOf("\n", at + 1)
  }
  return line
}

type Block = {
  readonly id: string
  readonly mark: string | undefined
  /** 0-based index of the declaration line. */
  readonly index: number
  /** The declaration line and the lines after it, up to the next one. */
  readonly lines: ReadonlyArray<string>
}

/** Each declaration's block: its line, to the next declaration or heading. */
function blocksOf(text: string): Array<Block> {
  const all = lines(withoutFences(text))
  const blocks: Array<Block> = []
  for (const [index, line] of all.entries()) {
    const found = DECLARATION.exec(line)?.groups
    const id = found?.["id"]
    if (id === undefined) continue
    const end = all.findIndex(
      (next, at) => at > index && (DECLARATION.test(next) || HEADING.test(next))
    )
    blocks.push({
      id,
      mark: found?.["mark"],
      index,
      lines: all.slice(index, end === -1 ? undefined : end),
    })
  }
  return blocks
}

/** Every declaration in one file's text, with the parts its block lacks. */
export function parseDeclarations(
  file: string,
  text: string
): Array<Declaration> {
  const declarations: Array<Declaration> = []
  for (const { id, mark, index, lines: own } of blocksOf(text)) {
    const wanted: ReadonlyArray<Part> =
      mark === "retired"
        ? ["retired"]
        : mark === "not reviewable"
          ? []
          : ACTIVE_PARTS
    const block = own
      .slice(1)
      .map((next) => next.replace(/^[\s>]*(?:[-*]\s+)?/, ""))
    declarations.push({
      id,
      file,
      line: index + 1,
      missing: wanted.filter(
        (part) => !block.some((entry) => PART_LINE[part].test(entry))
      ),
    })
  }
  return declarations
}

/** The declarations among `docs`, in path order, without the quoted copies. */
function scan(docs: ReadonlyMap<string, string>): {
  declarations: Array<Declaration>
  quoted: Set<string>
} {
  const declarations: Array<Declaration> = []
  const quoted = new Set<string>()
  for (const file of [...docs.keys()].sort()) {
    for (const declaration of parseDeclarations(file, docs.get(file) ?? "")) {
      if (QUOTED_COPIES.get(declaration.id) === file) quoted.add(declaration.id)
      else declarations.push(declaration)
    }
  }
  return { declarations, quoted }
}

/**
 * The invariant violations among `docs` (repo-relative path -> text, every
 * tracked `*.md`), in a stable order. `base` is the same files as the base ref
 * holds them, or null when there is nothing to hold the tree against.
 */
export function findInvariantViolations(
  docs: ReadonlyMap<string, string>,
  base: ReadonlyMap<string, string> | null
): Array<PolicyViolation> {
  const violations: Array<PolicyViolation> = []
  const first = new Map<string, Declaration>()
  const { declarations, quoted } = scan(docs)
  for (const declaration of declarations) {
    const { id, file } = declaration
    const earlier = first.get(id)
    if (earlier !== undefined) {
      violations.push({
        kind: "duplicateId",
        file,
        line: declaration.line,
        id,
        first: `${earlier.file}:${earlier.line}`,
      })
      continue
    }
    first.set(id, declaration)
    if (declaration.missing.length > 0) {
      violations.push({
        kind: "missingParts",
        file,
        line: declaration.line,
        id,
        missing: declaration.missing.map((part) => PART_LABEL[part]),
      })
    }
  }
  for (const [id, file] of QUOTED_COPIES) {
    if (docs.has(file) && !quoted.has(id))
      violations.push({ kind: "staleQuote", id, file })
  }
  if (base !== null) {
    const kept = new Set(scan(base).declarations.map(({ id }) => id))
    for (const id of [...kept].sort()) {
      if (!first.has(id)) violations.push({ kind: "removedId", id })
    }
  }
  return violations
}

export type DebtLabel = {
  readonly id: string
  readonly line: number
  readonly tracked: boolean
}

/** The debt labels in one file's declaration blocks, with their lines. */
export function findDebtLabels(text: string): Array<DebtLabel> {
  const labels: Array<DebtLabel> = []
  for (const block of blocksOf(text)) {
    const joined = block.lines.join("\n")
    const tracked = TRACKED.test(joined)
    for (const match of joined.matchAll(DEBT_LABEL)) {
      labels.push({
        id: block.id,
        line: block.index + lineAt(joined, match.index),
        tracked,
      })
    }
  }
  return labels
}

/**
 * The debt violations among `docs`: a label with no `Tracked: #<issue>` in its
 * block, and more labels than `base` holds (null: nothing to hold against).
 */
export function findDebtViolations(
  docs: ReadonlyMap<string, string>,
  base: ReadonlyMap<string, string> | null
): Array<PolicyViolation> {
  const count = (files: ReadonlyMap<string, string>): number =>
    [...files.values()].reduce(
      (sum, text) => sum + findDebtLabels(text).length,
      0
    )
  const violations: Array<PolicyViolation> = []
  for (const file of [...docs.keys()].sort()) {
    for (const label of findDebtLabels(docs.get(file) ?? "")) {
      if (!label.tracked)
        violations.push({
          kind: "untrackedDebt",
          file,
          line: label.line,
          id: label.id,
        })
    }
  }
  if (base !== null) {
    const now = count(docs)
    const before = count(base)
    if (now > before)
      violations.push({ kind: "debtGrew", count: now, base: before })
  }
  return violations
}

/**
 * The jobs CI Gate needs in pr.yml's text, each with its block, or null when
 * the gate or its `needs` cannot be read (a closed shape: a flow list, or a
 * block list of `- <job>` lines).
 */
function gatedJobs(workflow: string): Map<string, string> | null {
  const all = lines(workflow)
  const jobs = new Map<string, string>()
  let current: { id: string; body: Array<string> } | null = null
  for (const line of all) {
    const id = JOB.exec(line)?.groups?.["id"]
    if (id !== undefined) {
      if (current !== null) jobs.set(current.id, current.body.join("\n"))
      current = { id, body: [] }
    } else if (current !== null) {
      if (/^\S/.test(line)) {
        jobs.set(current.id, current.body.join("\n"))
        current = null
      } else current.body.push(line)
    }
  }
  if (current !== null) jobs.set(current.id, current.body.join("\n"))
  const gate = jobs.get("ci-gate")
  if (gate === undefined) return null
  const needs = /^ {4}needs:(?<rest>[^]*?)(?=^ {4}\w|(?![^]))/m.exec(gate)
    ?.groups?.["rest"]
  if (needs === undefined) return null
  const ids = [...needs.matchAll(/[\w-]+/g)].map(([id]) => id)
  if (ids.length === 0) return null
  const gated = new Map<string, string>()
  for (const id of ids) {
    const body = jobs.get(id)
    if (body === undefined) return null
    gated.set(id, body)
  }
  return gated
}

/**
 * The `Held by:` lines in the policy documents whose check is missing from
 * `scripts` (the root package.json's) or run by no job CI Gate needs in
 * `workflow` (pr.yml's text).
 */
export function findHeldByViolations(
  docs: ReadonlyMap<string, string>,
  scripts: Readonly<Record<string, string>>,
  workflow: string
): Array<PolicyViolation> {
  const violations: Array<PolicyViolation> = []
  const gated = gatedJobs(workflow)
  let reported = false
  for (const file of POLICY_DOCS) {
    for (const [index, line] of lines(
      withoutFences(docs.get(file) ?? "")
    ).entries()) {
      const name = HELD_BY.exec(line)?.groups?.["name"]
      if (name === undefined) continue
      const script = scripts[name]
      if (script === undefined) {
        violations.push({
          kind: "heldByUnwired",
          file,
          line: index + 1,
          name,
          why: "noScript",
        })
        continue
      }
      if (gated === null) {
        if (!reported) violations.push({ kind: "gateUnreadable" })
        reported = true
        continue
      }
      const target = SCRIPT_FILE.exec(script)?.[0]
      const runs = [...gated.values()].some(
        (body) =>
          body.includes(`pnpm ${name}`) ||
          (target !== undefined && body.includes(target))
      )
      if (!runs)
        violations.push({
          kind: "heldByUnwired",
          file,
          line: index + 1,
          name,
          why: "notInGate",
        })
    }
  }
  return violations
}

/** REVIEW.md's `##` sections: heading -> body. */
function sectionsOf(text: string): Map<string, string> {
  const sections = new Map<string, string>()
  let heading: string | null = null
  let body: Array<string> = []
  for (const line of lines(withoutFences(text))) {
    const found = /^## (?<text>.+?)\s*$/.exec(line)?.groups?.["text"]
    if (found !== undefined) {
      if (heading !== null) sections.set(heading, body.join("\n"))
      heading = found
      body = []
    } else if (heading !== null) {
      if (line.startsWith("# ")) break
      body.push(line)
    }
  }
  if (heading !== null) sections.set(heading, body.join("\n"))
  return sections
}

/** AGENTS.md's "Review guidelines" bullets: bold lead -> the bullet's text. */
function digestBullets(text: string): Map<string, string> {
  const section = sectionsOf(text).get("Review guidelines") ?? ""
  const bullets = new Map<string, string>()
  let lead: string | null = null
  let body: Array<string> = []
  for (const line of lines(section)) {
    const found = BULLET_LEAD.exec(line)?.groups?.["lead"]
    if (found !== undefined) {
      if (lead !== null) bullets.set(lead, body.join("\n"))
      lead = found
      body = [line]
    } else if (lead !== null && /^\s+\S/.test(line)) body.push(line)
    else if (lead !== null && line.trim() !== "") {
      bullets.set(lead, body.join("\n"))
      lead = null
    }
  }
  if (lead !== null) bullets.set(lead, body.join("\n"))
  return bullets
}

const leadKey = (text: string): string =>
  text
    .replace(/[.:]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()

function namesIn(text: string): Set<string> {
  return new Set([
    ...[...text.matchAll(CHECK_NAME)].map(([name]) => name),
    ...[...text.matchAll(ID_SPAN)].map(([, id]) => id ?? ""),
  ])
}

/** Where AGENTS.md's review digest and REVIEW.md disagree. */
export function findDigestViolations(
  docs: ReadonlyMap<string, string>
): Array<PolicyViolation> {
  const review = docs.get("REVIEW.md")
  const agents = docs.get("AGENTS.md")
  if (review === undefined || agents === undefined) return []
  const bullets = digestBullets(agents)
  const used = new Set<string>()
  const violations: Array<PolicyViolation> = []
  for (const [heading, body] of sectionsOf(review)) {
    const lead = [...bullets.keys()].find((candidate) =>
      leadKey(candidate).startsWith(leadKey(heading))
    )
    if (lead === undefined) {
      violations.push({ kind: "digestMissing", heading })
      continue
    }
    used.add(lead)
    const inReview = namesIn(body)
    const inAgents = namesIn(bullets.get(lead) ?? "")
    const onlyReview = [...inReview].filter((name) => !inAgents.has(name))
    const onlyAgents = [...inAgents].filter((name) => !inReview.has(name))
    if (onlyReview.length > 0)
      violations.push({
        kind: "digestDrift",
        heading,
        only: "REVIEW.md",
        names: onlyReview.sort(),
      })
    if (onlyAgents.length > 0)
      violations.push({
        kind: "digestDrift",
        heading,
        only: "AGENTS.md",
        names: onlyAgents.sort(),
      })
  }
  for (const lead of bullets.keys()) {
    if (!used.has(lead)) violations.push({ kind: "digestExtra", lead })
  }
  return violations
}

function normalizeHeading(text: string): string {
  return text.replace(/[`*]/g, "").replace(/\s+/g, " ").trim().toLowerCase()
}

function headingsOf(text: string): Set<string> {
  const found = new Set<string>()
  for (const line of lines(withoutFences(text))) {
    const heading = HEADING.exec(line)?.groups?.["text"]
    if (heading === undefined) continue
    found.add(normalizeHeading(heading))
    const title = heading.split(": ", 1)[0]
    if (title !== undefined && title !== heading)
      found.add(normalizeHeading(title))
  }
  return found
}

type TreeIndex = {
  /** Every tracked path and every `/`-suffix of one. */
  readonly suffixes: ReadonlySet<string>
  /** Every tracked file and directory, by full path. */
  readonly entries: ReadonlySet<string>
  readonly topLevel: ReadonlySet<string>
}

function indexTree(tracked: ReadonlyArray<string>): TreeIndex {
  const suffixes = new Set<string>()
  const entries = new Set<string>()
  const topLevel = new Set<string>()
  for (const path of tracked) {
    const parts = path.split("/")
    for (let at = 0; at < parts.length; at += 1) {
      suffixes.add(parts.slice(at).join("/"))
      entries.add(parts.slice(0, at + 1).join("/"))
    }
    if (parts.length > 1 && parts[0] !== undefined) topLevel.add(parts[0])
  }
  return { suffixes, entries, topLevel }
}

function resolves(index: TreeIndex, ref: string): boolean | null {
  const segments = ref.split("/")
  const last = segments[segments.length - 1] ?? ""
  const isTree = segments.length > 1 && index.topLevel.has(segments[0] ?? "")
  if (isTree) return index.entries.has(ref)
  return FILE_EXTENSION.test(last) ? index.suffixes.has(ref) : null
}

/**
 * The reference violations in the policy documents among `docs` (repo-relative
 * path -> text, every tracked `*.md`), given `tracked`, the repo's file list.
 */
export function findReferenceViolations(
  docs: ReadonlyMap<string, string>,
  tracked: ReadonlyArray<string>
): Array<PolicyViolation> {
  const violations: Array<PolicyViolation> = []
  const index = indexTree(tracked)
  const headings = new Map<string, Set<string>>()
  const headingsIn = (path: string): Set<string> => {
    const known = headings.get(path)
    if (known !== undefined) return known
    const made = headingsOf(docs.get(path) ?? "")
    headings.set(path, made)
    return made
  }
  const usedForeign = new Set<string>()
  for (const file of POLICY_DOCS) {
    const text = docs.get(file)
    if (text === undefined) {
      violations.push({ kind: "missingPolicyDoc", file })
      continue
    }
    const prose = withoutFences(text)
    for (const match of prose.matchAll(SPAN)) {
      const ref = (match[1] ?? "")
        .replace(/:\d+(?:[-:]\d+)*$/, "")
        .replace(/\/$/, "")
      if (!PATH_SHAPE.test(ref) || /^(?:\.{1,2}(?:\/|$)|@)/.test(ref)) continue
      if (FOREIGN_PATHS.has(ref)) {
        usedForeign.add(ref)
        continue
      }
      if (resolves(index, ref) === false) {
        violations.push({
          kind: "missingPath",
          file,
          line: lineAt(prose, match.index),
          ref,
        })
      }
    }
    for (const match of prose.matchAll(HEADING_REF)) {
      const target = match.groups?.["file"] ?? ""
      const heading = (match.groups?.["heading"] ?? "").replace(/\s+/g, " ")
      if (FOREIGN_PATHS.has(target)) continue
      const candidates = tracked.filter(
        (path) => path === target || path.endsWith(`/${target}`)
      )
      if (
        candidates.length > 0 &&
        !candidates.some((path) =>
          headingsIn(path).has(normalizeHeading(heading))
        )
      ) {
        violations.push({
          kind: "missingHeading",
          file,
          line: lineAt(prose, match.index),
          target,
          heading,
        })
      }
    }
  }
  for (const path of FOREIGN_PATHS.keys()) {
    if (!usedForeign.has(path)) violations.push({ kind: "staleForeign", path })
  }
  return violations
}

/** One human-readable line per violation, naming the fix. */
export function describePolicyViolation(violation: PolicyViolation): string {
  switch (violation.kind) {
    case "missingParts": {
      return `${violation.file}:${violation.line}: ${violation.id} has no ${violation.missing.join(", ")} line. A line starting \`**<ID>:\` declares an invariant (CLAUDE.md, "Gray-area invariants: declare them falsifiable"); if this is not one, write the bold label without an ID-shaped start.`
    }
    case "duplicateId": {
      return `${violation.file}:${violation.line}: ${violation.id} is already declared at ${violation.first}. An ID names one invariant and is never reused.`
    }
    case "removedId": {
      return `${violation.id} is declared at the base ref and nowhere now. IDs are stable: keep its declaration and mark it "**${violation.id} (retired): …**" with a _Retired:_ reason, or restore it.`
    }
    case "staleQuote": {
      return `${violation.file} no longer quotes ${violation.id}. Remove it from QUOTED_COPIES in packages/eslint/src/policy-docs.ts.`
    }
    case "missingPolicyDoc": {
      return `${violation.file} is a policy document (POLICY_DOCS in packages/eslint/src/policy-docs.ts) and is not in the tree.`
    }
    case "missingPath": {
      return `${violation.file}:${violation.line}: \`${violation.ref}\` is not a tracked file or directory. Fix the path, or add it to FOREIGN_PATHS in packages/eslint/src/policy-docs.ts if it lives in another repository.`
    }
    case "missingHeading": {
      return `${violation.file}:${violation.line}: ${violation.target} has no heading "${violation.heading}". Quote its heading as it reads now.`
    }
    case "staleForeign": {
      return `${violation.path} is in FOREIGN_PATHS (packages/eslint/src/policy-docs.ts) and no policy document names it. Remove the entry.`
    }
    case "untrackedDebt": {
      return `${violation.file}:${violation.line}: ${violation.id} is labelled "mechanical; not yet a rule" with no \`Tracked: #<issue>\` in its block. Name the issue that will make it a check.`
    }
    case "heldByUnwired": {
      return violation.why === "noScript"
        ? `${violation.file}:${violation.line}: Held by \`pnpm ${violation.name}\`, which is not a script in the root package.json.`
        : `${violation.file}:${violation.line}: Held by \`pnpm ${violation.name}\`, which no pr.yml job that CI Gate needs runs. Wire it in, or drop the line with the rule it held.`
    }
    case "gateUnreadable": {
      return `.github/workflows/pr.yml: CI Gate's \`needs\` could not be read (a \`ci-gate\` job whose \`needs\` is a list of jobs that exist), so no Held by line could be checked.`
    }
    case "digestMissing": {
      return `REVIEW.md's section "${violation.heading}" has no bullet in AGENTS.md's "Review guidelines" whose bold lead begins with it.`
    }
    case "digestExtra": {
      return `AGENTS.md's review bullet "${violation.lead}" matches no REVIEW.md section. Add the section to REVIEW.md, or drop the bullet.`
    }
    case "digestDrift": {
      return `"${violation.heading}": ${violation.names.join(", ")} named only in ${violation.only}. AGENTS.md's bullet and REVIEW.md's section name the same checks and invariant IDs.`
    }
    case "debtGrew": {
      return `${violation.count} "mechanical; not yet a rule" labels, ${violation.base} at the base ref. Make the rule a check instead of declaring more debt (CLAUDE.md, "Gray-area invariants: declare them falsifiable").`
    }
    default: {
      const unhandled: never = violation
      throw new Error(`Unhandled policy violation: ${String(unhandled)}`)
    }
  }
}
