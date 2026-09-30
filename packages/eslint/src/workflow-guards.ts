// Three guards over this repo's GitHub Actions files, each a pure function
// over a file's text. `scripts/check-workflows.ts` runs them over every
// tracked `.github/workflows/*.y(a)ml` and `.github/actions/**/action.y(a)ml`.
//
// Retention (CLAUDE.md, "Workflow storage"): an `actions/upload-artifact` or
// `actions/upload-pages-artifact` step sets `retention-days: 1`, or sets it
// explicitly to something else and says why in a `Retention:` line of the
// unbroken `#` comment block directly above the step. A step with no
// `retention-days` at all fails either way: the repo default (90 days unless
// changed in Settings) is not a period anybody chose, and a stated reason
// should sit next to the number it justifies. So does a value that is not a
// literal number of days (`0`, empty, a `${{ }}` expression): each can
// resolve to that default.
//
// RS1 (CLAUDE.md, "Cross-repo coupling"): `server-route-snapshot.yml`, byte
// for byte, hashes to RS1_FINGERPRINT. Every edit fails until the pin moves in
// the same change, comment lines included, and so does a deletion or rename.
// The pin bump is where a reviewer applies RS1's falsifier to the diff: a
// comment-only change needs no re-check, anything else does. The raw bytes, not
// a normal form with the free lines taken out, because telling a comment from
// a `#` line inside a multi-line scalar is YAML parsing, and each lexical
// attempt at it left an edit that changed the workflow without moving the pin
// (#1604: trailing blanks under `|+`, trailing whitespace, `- |` items).
//
// RS2 (same section): no workflow or composite action other than
// `server-route-snapshot.yml` names `bot/server-route-snapshot`.
//
// Deliberately lexical, like test-layout.ts: a YAML parser would need an
// install for a check that otherwise runs on bare Node. So each rule accepts a
// closed shape and fails the rest, rather than listing shapes it rejects.

import { createHash } from "node:crypto"

export const RS1_FILE = ".github/workflows/server-route-snapshot.yml"
// Updating this pin is the RS1 re-check: whoever changes it confirms, in the
// same change, that the workflow still only reads and dispatches.
export const RS1_FINGERPRINT =
  "f1f668d5edd39995e1bf23e74c7aac9d21d9124c10110c9dfaffe3f93c7d2927"
export const SNAPSHOT_BRANCH = "bot/server-route-snapshot"

export type WorkflowViolation =
  | {
      readonly kind: "retentionMissing"
      readonly file: string
      readonly line: number
    }
  | {
      readonly kind: "retentionUnreadable"
      readonly file: string
      readonly line: number
    }
  | {
      readonly kind: "retentionNotDays"
      readonly file: string
      readonly line: number
      readonly value: string
    }
  | {
      readonly kind: "retentionUnstated"
      readonly file: string
      readonly line: number
      readonly value: string
    }
  | {
      readonly kind: "rs1Changed"
      readonly file: string
      readonly actual: string | null
    }
  | { readonly kind: "rs2Named"; readonly file: string; readonly line: number }

const UPLOAD_STEP =
  /^(\s*)(-\s+)?uses:\s*["']?actions\/upload-(?:pages-)?artifact@/
const SEQUENCE_ITEM = /^(\s*)-(\s+)\S/
const RETENTION = /^\s*retention-days:\s*(.*)$/
const WITH_KEY = /^\s*with:(.*)$/
const RETENTION_TAG = /^#+\s*Retention:\s*\S/
const DAYS = /^[1-9][0-9]*$/

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

function isBlankOrComment(line: string): boolean {
  const trimmed = line.trim()
  return trimmed === "" || trimmed.startsWith("#")
}

// `"1"`, `'1'` and `1 # note` all read as `1`.
function scalarValue(raw: string): string {
  const withoutComment = raw.replace(/\s+#.*$/, "").trim()
  const quoted = /^(["'])(.*)\1$/.exec(withoutComment)
  return quoted?.[2] ?? withoutComment
}

// The line a step starts on: its own `- ` item line, found by walking up
// from the `uses:` key to the item whose key column is the same.
function stepStart(lines: ReadonlyArray<string>, usesLine: number): number {
  const keyColumn = indentOf(lines[usesLine] ?? "")
  for (let i = usesLine - 1; i >= 0; i--) {
    const line = lines[i] ?? ""
    if (isBlankOrComment(line)) continue
    const item = SEQUENCE_ITEM.exec(line)
    if (item && `${item[1] ?? ""}-${item[2] ?? ""}`.length === keyColumn)
      return i
    if (indentOf(line) < keyColumn) break
  }
  return usesLine
}

// The step's lines, its `- ` marker blanked so every key sits at `keyColumn`.
function stepBody(
  lines: ReadonlyArray<string>,
  start: number,
  keyColumn: number
): Array<string> {
  const first = lines[start] ?? ""
  const body = [
    SEQUENCE_ITEM.test(first)
      ? " ".repeat(keyColumn) + first.slice(keyColumn)
      : first,
  ]
  for (const next of lines.slice(start + 1)) {
    if (!isBlankOrComment(next) && indentOf(next) < keyColumn) break
    body.push(next)
  }
  return body
}

// One closed shape, not a list of rejected ones: the value counts only as a
// direct child of the step's block-style `with:` map, the one place the action
// receives it. Anywhere else (under `env:`, nested deeper) it is missing, and a
// flow-style `with: {...}` is reported as unreadable rather than guessed at.
type WithRetention =
  | { readonly shape: "value"; readonly value: string }
  | { readonly shape: "missing" | "flow" }

function withRetention(
  body: ReadonlyArray<string>,
  keyColumn: number
): WithRetention {
  for (const [index, line] of body.entries()) {
    const key = WITH_KEY.exec(line)
    if (!key || indentOf(line) !== keyColumn) continue
    if ((key[1] ?? "").replace(/(^|\s+)#.*$/, "").trim() !== "") {
      return { shape: "flow" }
    }
    let childColumn: number | null = null
    for (const child of body.slice(index + 1)) {
      if (isBlankOrComment(child)) continue
      if (indentOf(child) <= keyColumn) break
      childColumn ??= indentOf(child)
      const retention = RETENTION.exec(child)
      if (retention && indentOf(child) === childColumn) {
        return { shape: "value", value: scalarValue(retention[1] ?? "") }
      }
    }
    return { shape: "missing" }
  }
  return { shape: "missing" }
}

export function findRetentionViolations(
  file: string,
  text: string
): Array<WorkflowViolation> {
  const lines = text.split(/\r?\n/)
  const violations: Array<WorkflowViolation> = []
  lines.forEach((line, index) => {
    const upload = UPLOAD_STEP.exec(line)
    if (!upload) return
    const keyColumn = `${upload[1] ?? ""}${upload[2] ?? ""}`.length
    const start = upload[2] ? index : stepStart(lines, index)

    const found = withRetention(stepBody(lines, start, keyColumn), keyColumn)
    if (found.shape === "flow") {
      violations.push({ kind: "retentionUnreadable", file, line: start + 1 })
      return
    }
    if (found.shape !== "value") {
      violations.push({ kind: "retentionMissing", file, line: start + 1 })
      return
    }
    const { value } = found
    if (value === "1") return
    if (!DAYS.test(value)) {
      violations.push({
        kind: "retentionNotDays",
        file,
        line: start + 1,
        value,
      })
      return
    }

    let tagged = false
    for (const above of lines.slice(0, start).reverse()) {
      if (!above.trim().startsWith("#")) break
      if (RETENTION_TAG.test(above.trim())) tagged = true
    }
    if (!tagged) {
      violations.push({
        kind: "retentionUnstated",
        file,
        line: start + 1,
        value,
      })
    }
  })
  return violations
}

export function rs1Fingerprint(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

export function checkRs1(text: string | null): Array<WorkflowViolation> {
  const actual = text === null ? null : rs1Fingerprint(text)
  return actual === RS1_FINGERPRINT
    ? []
    : [{ kind: "rs1Changed", file: RS1_FILE, actual }]
}

export function findRs2Violations(
  file: string,
  text: string
): Array<WorkflowViolation> {
  if (file === RS1_FILE) return []
  const violations: Array<WorkflowViolation> = []
  text.split(/\r?\n/).forEach((line, index) => {
    if (line.includes(SNAPSHOT_BRANCH)) {
      violations.push({ kind: "rs2Named", file, line: index + 1 })
    }
  })
  return violations
}

export function isGuardedWorkflowPath(path: string): boolean {
  return (
    /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path) ||
    /^\.github\/actions\/.+\/action\.ya?ml$/.test(path)
  )
}

function assertNever(value: never): never {
  throw new Error(`unhandled workflow violation: ${JSON.stringify(value)}`)
}

export function describeWorkflowViolation(v: WorkflowViolation): string {
  switch (v.kind) {
    case "retentionMissing": {
      return `${v.file}:${v.line}: upload step sets no retention-days in its \`with:\` map. Set \`retention-days: 1\`, or a longer period with a \`# Retention: <why>\` line directly above the step.`
    }
    case "retentionUnreadable": {
      return `${v.file}:${v.line}: upload step has a flow-style \`with: {...}\` this check cannot read. Write \`with:\` as a block mapping, with \`retention-days\` on its own line.`
    }
    case "retentionNotDays": {
      return `${v.file}:${v.line}: upload step sets retention-days to "${v.value}", not a literal number of days. 0, empty or an expression can mean the repo default, so no \`Retention:\` line can justify it.`
    }
    case "retentionUnstated": {
      return `${v.file}:${v.line}: upload step keeps its artifact for ${v.value} (not 1 day) with no \`# Retention: <why>\` line in the comment block directly above it.`
    }
    case "rs1Changed": {
      return v.actual === null
        ? `${v.file} is missing. Deleting, renaming or moving it changes RS1 (CLAUDE.md, "Cross-repo coupling"): re-check the claim, then update RS1_FILE and RS1_FINGERPRINT in packages/eslint/src/workflow-guards.ts.`
        : `${v.file} changed (fingerprint ${v.actual}). Unless the change is comment lines only, re-check RS1 (CLAUDE.md, "Cross-repo coupling"): it still only reads and dispatches. Then set RS1_FINGERPRINT in packages/eslint/src/workflow-guards.ts to that value in the same change.`
    }
    case "rs2Named": {
      return `${v.file}:${v.line}: names ${SNAPSHOT_BRANCH}. Only ${RS1_FILE} may (RS2, CLAUDE.md, "Cross-repo coupling"); paulgsc/server's routes.yml is that PR's one writer.`
    }
    default: {
      return assertNever(v)
    }
  }
}
