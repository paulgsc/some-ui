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
// should sit next to the number it justifies.
//
// RS1 (CLAUDE.md, "Cross-repo coupling"): `server-route-snapshot.yml`, with
// full-line comments and blank lines outside block scalars removed, hashes to
// RS1_FINGERPRINT. Any other edit, a deletion or a rename fails until the pin
// is updated in the same change, and that pin bump is the reviewer's cue to
// re-check RS1's claim. Block scalars (`run: |` and any other `key: |` or
// `key: >`) and multi-line quoted scalars are hashed verbatim, because a `#`
// line inside one is data, not a comment.
//
// RS2 (same section): no workflow or composite action other than
// `server-route-snapshot.yml` names `bot/server-route-snapshot`.
//
// Deliberately lexical, like test-layout.ts: a YAML parser would need an
// install for a check that otherwise runs on bare Node, and every shape these
// rules read is a single line (`uses:`, `retention-days:`, a `#` line).

import { createHash } from "node:crypto"

export const RS1_FILE = ".github/workflows/server-route-snapshot.yml"
// Updating this pin is the RS1 re-check: whoever changes it confirms, in the
// same change, that the workflow still only reads and dispatches.
export const RS1_FINGERPRINT =
  "ad4708620ce48eed5dd81e42cbeea37f7ba7e4fedf51005fb42aeb8d4890817d"
export const SNAPSHOT_BRANCH = "bot/server-route-snapshot"

export type WorkflowViolation =
  | {
      readonly kind: "retentionMissing"
      readonly file: string
      readonly line: number
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
const RETENTION_TAG = /^#+\s*Retention:\s*\S/

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

    let value: string | null = null
    for (const next of lines.slice(start + 1)) {
      if (!isBlankOrComment(next) && indentOf(next) < keyColumn) break
      const retention = RETENTION.exec(next)
      if (retention) value = scalarValue(retention[1] ?? "")
    }
    if (value === null) {
      violations.push({ kind: "retentionMissing", file, line: start + 1 })
      return
    }
    if (value === "1") return

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

// `key: |`, `- run: >-`, `key: |2 # note`: the column of the key, so that
// every later line indented deeper (or blank) belongs to the scalar.
const BLOCK_SCALAR_KEY =
  /^(\s*(?:-\s+)?)[^\s#"'][^#]*?:\s*[|>][-+0-9]*\s*(?:#.*)?$/
// `key: "…` or `- key: '…` whose quote does not close on the same line.
const QUOTED_VALUE = /^\s*(?:-\s+)?[^\s#"'][^#]*?:\s+(["'])(.*)$/

// Whether `rest` holds the closing quote: `''` escapes a single quote, a
// backslash escapes inside double quotes.
function closesQuote(rest: string, quote: string): boolean {
  return quote === "'"
    ? rest.replace(/''/g, "").includes("'")
    : rest.replace(/\\./g, "").includes('"')
}

export function rs1Normalize(text: string): string {
  const lines = text.split(/\r?\n/)
  const out: Array<string> = []
  let blockKeyColumn: number | null = null
  let block: Array<string> = []
  let openQuote: string | null = null

  const flushBlock = (): void => {
    while (block.length > 0 && block.at(-1)?.trim() === "") {
      block.pop()
    }
    out.push(...block)
    block = []
    blockKeyColumn = null
  }

  for (const line of lines) {
    if (openQuote !== null) {
      out.push(line)
      if (closesQuote(line, openQuote)) openQuote = null
      continue
    }
    if (blockKeyColumn !== null) {
      if (line.trim() === "" || indentOf(line) > blockKeyColumn) {
        block.push(line)
        continue
      }
      flushBlock()
    }
    if (isBlankOrComment(line)) continue
    out.push(line.trimEnd())

    const blockKey = BLOCK_SCALAR_KEY.exec(line)
    if (blockKey) {
      blockKeyColumn = (blockKey[1] ?? "").length
      continue
    }
    const quoted = QUOTED_VALUE.exec(line)
    const quote = quoted?.[1]
    if (quote !== undefined && !closesQuote(quoted?.[2] ?? "", quote)) {
      openQuote = quote
    }
  }
  flushBlock()
  return out.join("\n")
}

export function rs1Fingerprint(text: string): string {
  return createHash("sha256").update(rs1Normalize(text)).digest("hex")
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
      return `${v.file}:${v.line}: upload step sets no retention-days. Set \`retention-days: 1\`, or a longer period with a \`# Retention: <why>\` line directly above the step.`
    }
    case "retentionUnstated": {
      return `${v.file}:${v.line}: upload step keeps its artifact for ${v.value} (not 1 day) with no \`# Retention: <why>\` line in the comment block directly above it.`
    }
    case "rs1Changed": {
      return v.actual === null
        ? `${v.file} is missing. Deleting, renaming or moving it changes RS1 (CLAUDE.md, "Cross-repo coupling"): re-check the claim, then update RS1_FILE and RS1_FINGERPRINT in packages/eslint/src/workflow-guards.ts.`
        : `${v.file} changed beyond comment lines (fingerprint ${v.actual}). Re-check RS1 (CLAUDE.md, "Cross-repo coupling"): it still only reads and dispatches. Then set RS1_FINGERPRINT in packages/eslint/src/workflow-guards.ts to that value in the same change.`
    }
    case "rs2Named": {
      return `${v.file}:${v.line}: names ${SNAPSHOT_BRANCH}. Only ${RS1_FILE} may (RS2, CLAUDE.md, "Cross-repo coupling"); paulgsc/server's routes.yml is that PR's one writer.`
    }
    default: {
      return assertNever(v)
    }
  }
}
