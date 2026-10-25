// What the policy documents' text can hold (CLAUDE.md, "Gray-area invariants:
// declare them falsifiable"), as pure functions over the markdown files'
// text. `scripts/check-policy-docs.ts` runs them over every tracked `*.md`.
//
// Invariant declarations, in any markdown file. A declaration is a line that
// starts, after any `>` quote markers, with `**<ID>:`, `**<ID> (not
// reviewable):` or `**<ID> (retired):`, with a space after the colon (a bold
// `- **ID:**` list item is not one). Its block runs to the next declaration or heading.
// - An active one has a line starting `_Claim:_`, `_Falsified by_`,
//   `_Scope:_` and `_Why not …:_` (`enforced`, `lint or tests`, `wholly
//   enforced`). One marked `(not reviewable)` needs none: no diff can falsify
//   it. A retired one has a `_Retired:_` line giving the reason.
// - An ID is declared once across the repo (`QUOTED_COPIES` is the one
//   exception), and an ID declared at the base ref is still declared: a
//   renumbered or dropped one fails, a moved one does not. IDs are stable.
//
// References, in the policy documents (`POLICY_DOCS`), outside fenced code:
// - a backticked path ending in a file extension names a tracked file, as a
//   full path or any `/`-suffix of one (a bare basename included);
// - a backticked path under a top-level directory names a tracked file or
//   directory;
// - `` `file.md`, "Heading" `` (a `→` or `->` for the comma, line breaks
//   allowed) names a heading in that file, whole or up to its first `: `
//   ("Two kinds of pull request" for "Two kinds of pull request: the story
//   moved, or a promise broke").
// A path in another repository is listed in `FOREIGN_PATHS`; an entry no
// policy document uses fails, so the list only shrinks with the prose.
//
// What it cannot hold: whether a falsifier is decidable from a hunk, whether a
// claim is true, whether a sentence should be a rule. That is review's
// (REVIEW.md, "Reviewing a change that declares or edits an invariant").
//
// Why a script and not an ESLint rule: both checks read other files (the
// tree's paths and headings, the base ref's IDs), and `eslint --cache` re-uses
// a file's verdict until that file's own content changes (see test-layout.ts).
// Lexical, like workflow-guards.ts: each rule accepts a closed shape.

export const POLICY_DOCS: ReadonlyArray<string> = [
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
const HEADING = /^ {0,3}#{1,6}[ \t]+(?<text>.+?)[ \t]*#*[ \t]*$/
const FENCE = /^[\s>]*(?:```|~~~)/
const SPAN = /`([^`\n]+)`/g
const HEADING_REF =
  /`(?<file>[\w./-]+\.md)`\s*(?:,|→|->)?\s*"(?<heading>[^"]+)"/g
const FILE_EXTENSION =
  /\.(?:md|ts|tsx|js|jsx|mjs|cjs|json|jsonc|ya?ml|toml|sh|css|sql|typ|html|rs|allowlist|gradle|java|kt|xml|txt|lock)$/
const PATH_SHAPE = /^[\w.@-]+(?:\/[\w.@-]+)*$/

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

export type Declaration = {
  readonly id: string
  readonly file: string
  readonly line: number
  readonly missing: ReadonlyArray<Part>
}

function lines(text: string): Array<string> {
  return text.replace(/\r\n/g, "\n").split("\n")
}

/** The text with fenced code blocks blanked, so line numbers still hold. */
function withoutFences(text: string): string {
  let inside = false
  return lines(text)
    .map((line) => {
      if (FENCE.test(line)) {
        inside = !inside
        return ""
      }
      return inside ? "" : line
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

/** The ID a declaration line declares, or null for any other line. */
export function declaredId(line: string): string | null {
  return DECLARATION.exec(line)?.groups?.["id"] ?? null
}

/** Every declaration in one file's text, with the parts its block lacks. */
export function parseDeclarations(
  file: string,
  text: string
): Array<Declaration> {
  const all = lines(withoutFences(text))
  const declarations: Array<Declaration> = []
  for (const [index, line] of all.entries()) {
    const found = DECLARATION.exec(line)?.groups
    const id = found?.["id"]
    if (id === undefined) continue
    const mark = found?.["mark"]
    const wanted: ReadonlyArray<Part> =
      mark === "retired"
        ? ["retired"]
        : mark === "not reviewable"
          ? []
          : ACTIVE_PARTS
    const block: Array<string> = []
    for (const next of all.slice(index + 1)) {
      if (DECLARATION.test(next) || HEADING.test(next)) break
      block.push(next.replace(/^[\s>]*(?:[-*]\s+)?/, ""))
    }
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

/**
 * The invariant violations among `docs` (repo-relative path -> text, every
 * tracked `*.md`), in a stable order. `base` is the IDs declared at the base
 * ref, or null when there is nothing to hold the tree against.
 */
export function findInvariantViolations(
  docs: ReadonlyMap<string, string>,
  base: ReadonlySet<string> | null
): Array<PolicyViolation> {
  const violations: Array<PolicyViolation> = []
  const first = new Map<string, Declaration>()
  const quoted = new Set<string>()
  for (const file of [...docs.keys()].sort()) {
    for (const declaration of parseDeclarations(file, docs.get(file) ?? "")) {
      const { id } = declaration
      if (QUOTED_COPIES.get(id) === file) {
        quoted.add(id)
        continue
      }
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
  }
  for (const [id, file] of QUOTED_COPIES) {
    if (docs.has(file) && !quoted.has(id))
      violations.push({ kind: "staleQuote", id, file })
  }
  if (base !== null) {
    for (const id of [...base].sort()) {
      if (!first.has(id)) violations.push({ kind: "removedId", id })
    }
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
  const isFile = FILE_EXTENSION.test(last)
  const isTree = segments.length > 1 && index.topLevel.has(segments[0] ?? "")
  if (!isFile && !isTree) return null
  return (
    (isFile && index.suffixes.has(ref)) || (isTree && index.entries.has(ref))
  )
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
      return `${violation.file}:${violation.line}: ${violation.id} has no ${violation.missing.join(", ")} line. A declared invariant has _Claim:_, _Falsified by_, _Scope:_ and _Why not enforced:_ lines; one no diff can falsify says "(not reviewable)" in its heading, and a retired one "(retired)" with a _Retired:_ reason (CLAUDE.md, "Gray-area invariants: declare them falsifiable").`
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
      return `${violation.file}:${violation.line}: \`${violation.ref}\` is not a file or directory here. Fix the path, or add it to FOREIGN_PATHS in packages/eslint/src/policy-docs.ts if it lives in another repository.`
    }
    case "missingHeading": {
      return `${violation.file}:${violation.line}: ${violation.target} has no heading "${violation.heading}". Quote its heading as it reads now.`
    }
    case "staleForeign": {
      return `${violation.path} is in FOREIGN_PATHS (packages/eslint/src/policy-docs.ts) and no policy document names it. Remove the entry.`
    }
    default: {
      const unhandled: never = violation
      throw new Error(`Unhandled policy violation: ${String(unhandled)}`)
    }
  }
}
