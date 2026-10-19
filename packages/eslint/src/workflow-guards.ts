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
// Installs (#1618): a workflow installs the workspace through
// `.github/actions/node-ci-setup`; an inline `pnpm … install` carries a
// `Why not node-ci-setup:` line in the comment block directly above its step.
//
// RS2 (same section): no workflow or composite action other than
// `server-route-snapshot.yml` names `bot/server-route-snapshot`.
//
// Families (same section, "Retention"): every upload step's artifact name and
// every `actions/cache` key belongs to a family in retention.ts, the upload's
// `retention-days` equals its family's TTL, retention.yml runs on every
// workflow that uploads a declared artifact, and a `docker/build-push-action`
// step turns off its build-record upload, which no family declares.
//
// Deliberately lexical, like test-layout.ts: a YAML parser would need an
// install for a check that otherwise runs on bare Node. So each rule accepts a
// closed shape and fails the rest, rather than listing shapes it rejects.

import { createHash } from "node:crypto"

import { ARTIFACT_FAMILIES, CACHE_FAMILIES, cacheFamily } from "./retention.ts"

export const RS1_FILE = ".github/workflows/server-route-snapshot.yml"
// Updating this pin is the RS1 re-check: whoever changes it confirms, in the
// same change, that the workflow still only reads and dispatches.
const RS1_FINGERPRINT =
  "f1f668d5edd39995e1bf23e74c7aac9d21d9124c10110c9dfaffe3f93c7d2927"
const SNAPSHOT_BRANCH = "bot/server-route-snapshot"
export const RETENTION_FILE = ".github/workflows/retention.yml"

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
  | {
      readonly kind: "artifactUndeclared"
      readonly file: string
      readonly line: number
      readonly name: string
    }
  | {
      readonly kind: "artifactTtl"
      readonly file: string
      readonly line: number
      readonly name: string
      readonly value: string
      readonly ttlDays: number
    }
  | {
      readonly kind: "artifactProducer"
      readonly file: string
      readonly line: number
      readonly name: string
      readonly workflow: string
    }
  | {
      readonly kind: "cacheUndeclared"
      readonly file: string
      readonly line: number
      readonly key: string
    }
  | {
      readonly kind: "retentionTrigger"
      readonly file: string
      readonly workflow: string
    }
  | {
      readonly kind: "familyWorkflowUnknown"
      readonly file: string
      readonly workflow: string
    }
  | {
      readonly kind: "inlineInstall"
      readonly file: string
      readonly line: number
    }
  | {
      readonly kind: "buildRecord"
      readonly file: string
      readonly line: number
    }

const UPLOAD_STEP =
  /^(\s*)(-\s+)?uses:\s*["']?actions\/upload-(?:pages-)?artifact@/
// The same reference anywhere else on a line (`- {uses: actions/upload-…}`)
// is a step this check cannot read, so it fails rather than being skipped.
const UPLOAD_ANYWHERE = /uses:\s*["']?actions\/upload-(?:pages-)?artifact@/
const SEQUENCE_ITEM = /^(\s*)-(\s+)\S/
const CACHE_STEP =
  /^(\s*)(-\s+)?uses:\s*["']?actions\/cache(?:\/restore|\/save)?@/
const BUILD_PUSH_STEP = /^(\s*)(-\s+)?uses:\s*["']?docker\/build-push-action@/
const WITH_KEY = /^\s*with:(.*)$/
const ENV_KEY = /^\s*env:(.*)$/
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

// One closed shape, not a list of rejected ones: a value counts only as a
// direct child of the step's block-style `with:` map (or `env:`, for an
// environment variable), the one place the action receives it. Anywhere else
// (under the other map, nested deeper) it is missing, and a flow-style
// `with: {...}`, like a whole `- {uses: ...}` step, is reported as unreadable
// rather than guessed at.
type WithValue =
  | { readonly shape: "value"; readonly value: string }
  | { readonly shape: "missing" | "flow" }

function withValue(
  body: ReadonlyArray<string>,
  keyColumn: number,
  key: string,
  map: "with" | "env" = "with"
): WithValue {
  const pattern = new RegExp(`^\\s*${key}:\\s*(.*)$`)
  const mapKey = map === "with" ? WITH_KEY : ENV_KEY
  for (const [index, line] of body.entries()) {
    const withKey = mapKey.exec(line)
    if (!withKey || indentOf(line) !== keyColumn) continue
    if ((withKey[1] ?? "").replace(/(^|\s+)#.*$/, "").trim() !== "") {
      return { shape: "flow" }
    }
    let childColumn: number | null = null
    for (const child of body.slice(index + 1)) {
      if (isBlankOrComment(child)) continue
      if (indentOf(child) <= keyColumn) break
      childColumn ??= indentOf(child)
      const found = pattern.exec(child)
      if (found && indentOf(child) === childColumn) {
        return { shape: "value", value: scalarValue(found[1] ?? "") }
      }
    }
    return { shape: "missing" }
  }
  return { shape: "missing" }
}

type Step = {
  readonly start: number
  readonly keyColumn: number
  readonly body: ReadonlyArray<string>
}

function stepsUsing(lines: ReadonlyArray<string>, uses: RegExp): Array<Step> {
  const found: Array<Step> = []
  lines.forEach((line, index) => {
    const match = uses.exec(line)
    if (!match) return
    const keyColumn = `${match[1] ?? ""}${match[2] ?? ""}`.length
    const start = match[2] ? index : stepStart(lines, index)
    found.push({ start, keyColumn, body: stepBody(lines, start, keyColumn) })
  })
  return found
}

export function findRetentionViolations(
  file: string,
  text: string
): Array<WorkflowViolation> {
  const lines = text.split(/\r?\n/)
  const violations: Array<WorkflowViolation> = []
  lines.forEach((line, index) => {
    const upload = UPLOAD_STEP.exec(line)
    if (!upload) {
      if (!line.trim().startsWith("#") && UPLOAD_ANYWHERE.test(line)) {
        violations.push({ kind: "retentionUnreadable", file, line: index + 1 })
      }
      return
    }
    const keyColumn = `${upload[1] ?? ""}${upload[2] ?? ""}`.length
    const start = upload[2] ? index : stepStart(lines, index)

    const found = withValue(
      stepBody(lines, start, keyColumn),
      keyColumn,
      "retention-days"
    )
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

// The step's artifact name as written, or the action's default.
function artifactName(body: ReadonlyArray<string>, keyColumn: number): string {
  const found = withValue(body, keyColumn, "name")
  if (found.shape === "value") return found.value
  return body.some((line) => /upload-pages-artifact@/.test(line))
    ? "github-pages"
    : "artifact"
}

// Every upload's name is a declared family's, kept for that family's TTL. A
// step whose retention-days is missing or unreadable is the retention rule's
// to report, not this one's.
export function findArtifactFamilyViolations(
  file: string,
  text: string,
  producers: ReadonlyArray<string>
): Array<WorkflowViolation> {
  const violations: Array<WorkflowViolation> = []
  for (const { start, keyColumn, body } of stepsUsing(
    text.split(/\r?\n/),
    UPLOAD_STEP
  )) {
    const name = artifactName(body, keyColumn)
    const family = ARTIFACT_FAMILIES.find((f) => f.name === name)
    if (!family) {
      violations.push({
        kind: "artifactUndeclared",
        file,
        line: start + 1,
        name,
      })
      continue
    }
    for (const workflow of producers) {
      if (!family.workflows.includes(workflow)) {
        violations.push({
          kind: "artifactProducer",
          file,
          line: start + 1,
          name,
          workflow,
        })
      }
    }
    const retention = withValue(body, keyColumn, "retention-days")
    if (
      retention.shape === "value" &&
      retention.value !== String(family.ttlDays)
    ) {
      violations.push({
        kind: "artifactTtl",
        file,
        line: start + 1,
        name,
        value: retention.value,
        ttlDays: family.ttlDays,
      })
    }
  }
  return violations
}

// A workflow's triggers: the direct children of its `on:` key (keys or list
// items), or the value on the same line (`on: push`, `on: [push, …]`).
function triggers(text: string): Set<string> {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => /^["']?on["']?:/.test(line))
  if (start < 0) return new Set()
  const inline = (lines[start] ?? "")
    .replace(/^["']?on["']?:/, "")
    .replace(/\s+#.*$/, "")
  const found = new Set(inline.match(/[a-z_]+/g) ?? [])
  let column: number | null = null
  for (const line of lines.slice(start + 1)) {
    if (isBlankOrComment(line)) continue
    if (indentOf(line) === 0) break
    column ??= indentOf(line)
    const key = /^\s*(?:-\s+)?([a-z_]+)(?::|\s*$)/.exec(line)?.[1]
    if (key !== undefined && indentOf(line) === column) found.add(key)
  }
  return found
}

// The `name:` of each top-level workflow whose runs execute a file: its own
// for a workflow it triggers, its callers' for a reusable workflow or a
// composite action, since a run carries the caller's name.
export function producerNames(
  texts: ReadonlyMap<string, string>
): Map<string, Array<string>> {
  const callers = new Map<string, Set<string>>()
  const own = new Map<string, string>()
  for (const [file, text] of texts) {
    if (file.startsWith(".github/workflows/")) {
      const on = triggers(text)
      on.delete("workflow_call")
      // A run with no `name:` is named after its file's path.
      const name = /^name:\s*(.+)$/m.exec(text)?.[1]
      if (on.size > 0)
        own.set(file, name === undefined ? file : scalarValue(name))
    }
    for (const match of text.matchAll(
      /^\s*(?:-\s+)?uses:\s*["']?\.\/(\.github\/[^"'\s@]+)/gm
    )) {
      const target = (match[1] ?? "").replace(/\/+$/, "")
      const callees =
        target.endsWith(".yml") || target.endsWith(".yaml")
          ? [target]
          : [`${target}/action.yml`, `${target}/action.yaml`]
      for (const callee of callees) {
        callers.set(callee, (callers.get(callee) ?? new Set()).add(file))
      }
    }
  }
  // A file's runs carry its own name when something else triggers it, and
  // its callers' names when it is called: both, for a workflow that is both.
  const resolve = (file: string, seen: Set<string>): Array<string> => {
    if (seen.has(file)) return []
    seen.add(file)
    const name = own.get(file)
    return [
      ...(name === undefined ? [] : [name]),
      ...[...(callers.get(file) ?? [])].flatMap((caller) =>
        resolve(caller, seen)
      ),
    ]
  }
  return new Map(
    [...texts.keys()].map((file) => [
      file,
      [...new Set(resolve(file, new Set()))].sort(),
    ])
  )
}

// The literal key prefix an `actions/cache` step writes under: the text before
// its first `${{ }}` expression.
export function literalKeyPrefix(key: string): string {
  return key.split("${{")[0] ?? ""
}

// Every `actions/cache` key starts with a declared family's prefix.
export function findCacheViolations(
  file: string,
  text: string
): Array<WorkflowViolation> {
  const lines = text.split(/\r?\n/)
  const violations: Array<WorkflowViolation> = []
  for (const { start, keyColumn, body } of stepsUsing(lines, CACHE_STEP)) {
    const found = withValue(body, keyColumn, "key")
    const key = found.shape === "value" ? found.value : ""
    // A pattern family (the Nix store) is written by an action, never a step.
    if (!cacheFamily(literalKeyPrefix(key), CACHE_FAMILIES)?.prefix) {
      violations.push({ kind: "cacheUndeclared", file, line: start + 1, key })
    }
  }
  return violations
}

const INSTALL = /\bpnpm\b[^#]*\binstall\b/
const INSTALL_TAG = /^#+\s*Why not node-ci-setup:\s*\S/

// Every inline install in a workflow says why it is not node-ci-setup's.
export function findInlineInstallViolations(
  file: string,
  text: string
): Array<WorkflowViolation> {
  if (!file.startsWith(".github/workflows/")) return []
  const lines = text.split(/\r?\n/)
  const violations: Array<WorkflowViolation> = []
  lines.forEach((line, index) => {
    if (line.trim().startsWith("#") || !INSTALL.test(line)) return
    // The step is the nearest `- ` item above that holds this line.
    let start = index
    while (start >= 0) {
      const candidate = lines[start] ?? ""
      if (
        SEQUENCE_ITEM.test(candidate) &&
        (start === index || indentOf(candidate) < indentOf(line))
      ) {
        break
      }
      start -= 1
    }
    let tagged = false
    for (const above of lines.slice(0, Math.max(start, 0)).reverse()) {
      if (!above.trim().startsWith("#")) break
      if (INSTALL_TAG.test(above.trim())) tagged = true
    }
    if (!tagged) {
      violations.push({ kind: "inlineInstall", file, line: index + 1 })
    }
  })
  return violations
}

// A build-push step uploads a build record as an artifact unless told not to.
export function findBuildRecordViolations(
  file: string,
  text: string
): Array<WorkflowViolation> {
  const lines = text.split(/\r?\n/)
  return stepsUsing(lines, BUILD_PUSH_STEP)
    .filter(({ body, keyColumn }) => {
      const found = withValue(
        body,
        keyColumn,
        "DOCKER_BUILD_RECORD_UPLOAD",
        "env"
      )
      return found.shape !== "value" || found.value !== "false"
    })
    .map(({ start }) => ({ kind: "buildRecord", file, line: start + 1 }))
}

// retention.yml runs after every workflow that uploads a family it keeps
// copies of (`keep` ≥ 1), so a new generation prunes the old at once; a
// family consumed in its run waits for Trunk or the daily sweep, within its
// TTL. Every workflow a family names exists.
export function checkRetentionTriggers(
  text: string | null,
  workflowNames: ReadonlySet<string>
): Array<WorkflowViolation> {
  const listed = new Set<string>()
  const lines = (text ?? "").split(/\r?\n/)
  const start = lines.findIndex((line) => /^\s*workflows:\s*$/.test(line))
  const column = indentOf(lines[start] ?? "")
  for (const line of start < 0 ? [] : lines.slice(start + 1)) {
    if (isBlankOrComment(line)) continue
    if (indentOf(line) <= column) break
    const item = /^\s*-\s+(.+)$/.exec(line)?.[1]
    if (item !== undefined) listed.add(scalarValue(item))
  }
  const violations: Array<WorkflowViolation> = []
  for (const workflow of new Set(
    ARTIFACT_FAMILIES.filter((f) => f.keep > 0).flatMap((f) => f.workflows)
  )) {
    if (!listed.has(workflow)) {
      violations.push({
        kind: "retentionTrigger",
        file: RETENTION_FILE,
        workflow,
      })
    }
  }
  for (const workflow of new Set(
    ARTIFACT_FAMILIES.flatMap((f) => f.workflows)
  )) {
    if (!workflowNames.has(workflow)) {
      violations.push({
        kind: "familyWorkflowUnknown",
        file: RETENTION_FILE,
        workflow,
      })
    }
  }
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
      return `${v.file}:${v.line}: upload step is written in a form this check cannot read (a flow-style \`with: {...}\` or \`- {uses: ...}\`). Write it as a block mapping, with \`uses:\`, \`with:\` and \`retention-days\` each on their own line.`
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
    case "artifactUndeclared": {
      return `${v.file}:${v.line}: uploads "${v.name}", which no family in packages/eslint/src/retention.ts declares. Add it to ARTIFACT_FAMILIES with its keep, TTL and workflows (CLAUDE.md, "Workflow storage").`
    }
    case "artifactTtl": {
      return `${v.file}:${v.line}: uploads "${v.name}" for ${v.value} day(s), but its family in packages/eslint/src/retention.ts says ${v.ttlDays}. Change one to match the other.`
    }
    case "artifactProducer": {
      return `${v.file}:${v.line}: uploads "${v.name}" in runs of "${v.workflow}", which its family in packages/eslint/src/retention.ts does not list, so retention.yml may not run after it. Add "${v.workflow}" to that family's workflows.`
    }
    case "cacheUndeclared": {
      return `${v.file}:${v.line}: caches under key "${v.key}", whose literal prefix no family in packages/eslint/src/retention.ts declares. Add it to CACHE_FAMILIES with its scope and keep.`
    }
    case "retentionTrigger": {
      return `${v.file}: its workflow_run list does not name "${v.workflow}", which uploads a family kept across runs, so a new copy would not prune the old at once. Add it.`
    }
    case "familyWorkflowUnknown": {
      return `packages/eslint/src/retention.ts: a family names the workflow "${v.workflow}", but no workflow has that \`name:\`. Rename it to match, or the sweep never runs after that workflow.`
    }
    case "inlineInstall": {
      return `${v.file}:${v.line}: installs inline. Use \`./.github/actions/node-ci-setup\` (with \`build: none\` if the job builds its own), or put a \`# Why not node-ci-setup: <reason>\` line directly above the step.`
    }
    case "buildRecord": {
      return `${v.file}:${v.line}: docker/build-push-action uploads a build-record artifact (90-day default) unless its step sets \`env: DOCKER_BUILD_RECORD_UPLOAD: false\`.`
    }
    default: {
      return assertNever(v)
    }
  }
}
