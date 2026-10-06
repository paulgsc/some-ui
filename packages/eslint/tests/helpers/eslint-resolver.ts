/**
 * Wraps ESLint's real APIs so every test suite uses the actual flat-config
 * resolution engine rather than a hand-rolled simulator.
 *
 *   calculateConfig(config, filePath)
 *     Uses ESLint.calculateConfigForFile(). Requires the file to exist on
 *     disk. Use a stub from tests/lint-fixtures/. filePath must be absolute
 *     (pass path.join(LINT_FIXTURES, "src/service.ts")).
 *
 *   lintSnippet(config, code, filePath)
 *     Uses ESLint.lintText(). File does NOT need to exist. filePath is used
 *     for glob matching only — pass a SHORT RELATIVE path like "src/foo.ts"
 *     so it matches **\/*.ts globs correctly relative to cwd (PACKAGE_ROOT).
 */

import path from "node:path"
import { fileURLToPath } from "node:url"
import { ESLint } from "eslint"
import type { Linter } from "eslint"

// packages/eslint/, the cwd for all ESLint instances (three hops up).
export const PACKAGE_ROOT = path.resolve(
  fileURLToPath(import.meta.url),
  "../../.."
)

// On-disk stubs for calculateConfigForFile, outside any ignores glob.
export const LINT_FIXTURES = path.join(PACKAGE_ROOT, "tests/lint-fixtures")

// ── Path safety ───────────────────────────────────────────────────────────────

function resolveSafePath(filePath: string): string {
  const abs = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(PACKAGE_ROOT, filePath)

  const rel = path.relative(PACKAGE_ROOT, abs)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(
      `Path escapes PACKAGE_ROOT.\n` +
        `  PACKAGE_ROOT : ${PACKAGE_ROOT}\n` +
        `  Requested    : ${filePath}\n` +
        `  Resolved     : ${abs}`
    )
  }
  return abs
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type EffectiveRules = Record<string, Linter.RuleEntry>
export type LintMessage = Linter.LintMessage
type Severity = 0 | 1 | 2

// ── calculateConfig ───────────────────────────────────────────────────────────

export async function calculateConfig(
  config: Linter.Config | Array<Linter.Config>,
  filePath: string
): Promise<EffectiveRules> {
  const absPath = resolveSafePath(filePath)

  const eslint = new ESLint({
    cwd: PACKAGE_ROOT,
    overrideConfigFile: true,
    overrideConfig: config,
  })

  const calculated = await eslint.calculateConfigForFile(absPath)

  if (calculated === undefined || calculated.rules === undefined) {
    throw new Error(
      `calculateConfigForFile() returned no config for: ${absPath}\n\n` +
        `Possible causes:\n` +
        `  1. File does not exist on disk. Create: touch ${absPath}\n` +
        `  2. Path matches an 'ignores' glob — rename the fixtures directory.\n` +
        `     Current fixture root: ${LINT_FIXTURES}\n` +
        `  3. No files[] glob matched the extension.\n` +
        `  4. PACKAGE_ROOT wrong: ${PACKAGE_ROOT}`
    )
  }

  // calculateConfigForFile()'s rules are typed as Partial<Linter.RulesRecord>
  // (values possibly undefined) even though ESLint never actually omits a
  // rule's severity here; narrowing that away requires an assertion.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return calculated.rules as EffectiveRules
}

// ── lintSnippet ───────────────────────────────────────────────────────────────
//
// Pass a short relative filePath ("src/foo.ts"): globs resolve against cwd,
// and an absolute path can fail to match them, linting with no rules at all.

export async function lintSnippet(
  config: Linter.Config | Array<Linter.Config>,
  code: string,
  filePath: string
): Promise<Array<LintMessage>> {
  if (path.isAbsolute(filePath)) {
    throw new Error(
      `lintSnippet() requires a relative filePath for reliable glob matching.\n` +
        `  Got: ${filePath}\n` +
        `  Use a short relative path like "src/foo.ts" or "tools/codegen.ts".`
    )
  }

  const eslint = new ESLint({
    cwd: PACKAGE_ROOT,
    overrideConfigFile: true,
    overrideConfig: config,
  })

  const absPath = path.resolve(PACKAGE_ROOT, filePath)

  const [result] = await eslint.lintText(code, { filePath: absPath })
  return result?.messages ?? []
}

// ── lintSnippetFixed ──────────────────────────────────────────────────────────
//
// Like lintSnippet(), but runs with ESLint's `fix: true` and returns the
// fixed source alongside the messages, for asserting on autofix output.
// Same relative-filePath requirement as lintSnippet().

export async function lintSnippetFixed(
  config: Linter.Config | Array<Linter.Config>,
  code: string,
  filePath: string
): Promise<{ messages: Array<LintMessage>; output: string }> {
  if (path.isAbsolute(filePath)) {
    throw new Error(
      `lintSnippetFixed() requires a relative filePath for reliable glob matching.\n` +
        `  Got: ${filePath}\n` +
        `  Use a short relative path like "src/foo.ts" or "tools/codegen.ts".`
    )
  }

  const eslint = new ESLint({
    cwd: PACKAGE_ROOT,
    overrideConfigFile: true,
    overrideConfig: config,
    fix: true,
  })

  const absPath = path.resolve(PACKAGE_ROOT, filePath)

  const [result] = await eslint.lintText(code, { filePath: absPath })
  return {
    messages: result?.messages ?? [],
    output: result?.output ?? code,
  }
}

// ── Severity normalisation ────────────────────────────────────────────────────

function severityOf(entry: Linter.RuleEntry | undefined): Severity {
  if (entry === undefined) return 0
  if (Array.isArray(entry)) return normalizeSev(entry[0])
  return normalizeSev(entry)
}

function normalizeSev(v: unknown): Severity {
  if (v === "off" || v === 0) return 0
  if (v === "warn" || v === 1) return 1
  if (v === "error" || v === 2) return 2
  return 0
}

// ── Assertion helpers ─────────────────────────────────────────────────────────

export function expectError(
  rules: EffectiveRules,
  ruleName: string,
  context: string
): void {
  const sev = severityOf(rules[ruleName])
  if (sev !== 2) {
    throw new Error(
      `[expectError] "${ruleName}" expected severity 2 (error) for ${context}.\n` +
        `  Got: ${rules[ruleName] === undefined ? "not present — typo or missing config assembly" : `severity ${sev} — ${JSON.stringify(rules[ruleName])}`}`
    )
  }
}

export function expectWarn(
  rules: EffectiveRules,
  ruleName: string,
  context: string
): void {
  const sev = severityOf(rules[ruleName])
  if (sev !== 1) {
    throw new Error(
      `[expectWarn] "${ruleName}" expected severity 1 (warn) for ${context}.\n` +
        `  Got: severity ${sev} — ${JSON.stringify(rules[ruleName] ?? "not present")}`
    )
  }
}

export function expectOff(
  rules: EffectiveRules,
  ruleName: string,
  context: string
): void {
  const sev = severityOf(rules[ruleName])
  if (sev !== 0) {
    throw new Error(
      `[expectOff] "${ruleName}" expected severity 0 (off) for ${context}.\n` +
        `  Got: severity ${sev} — ${JSON.stringify(rules[ruleName])}`
    )
  }
}

export function expectMessageForRule(
  messages: Array<LintMessage>,
  ruleId: string,
  context: string
): void {
  const found = messages.some((m) => m.ruleId === ruleId)
  if (!found) {
    const present = messages.map((m) => m.ruleId).join(", ") || "(none)"
    throw new Error(
      `[expectMessageForRule] Rule "${ruleId}" produced no message for ${context}.\n` +
        `  Rules that fired: ${present}`
    )
  }
}

export function expectNoMessageForRule(
  messages: Array<LintMessage>,
  ruleId: string,
  context: string
): void {
  const offending = messages.filter((m) => m.ruleId === ruleId)
  if (offending.length > 0) {
    throw new Error(
      `[expectNoMessageForRule] Rule "${ruleId}" should not fire for ${context}, ` +
        `but produced ${offending.length} message(s):\n${offending
          .map((m) => `  line ${m.line}: ${m.message}`)
          .join("\n")}`
    )
  }
}

/** `[title, code, ruleId, fires]`: one snippet and whether `ruleId` fires on it. */
export type SnippetCase = readonly [string, string, string, boolean]

/** Lints `code` and asserts `ruleId` fires on it (or does not); `context` labels a failure. */
export async function expectSnippet(
  config: Linter.Config | Array<Linter.Config>,
  code: string,
  filePath: string,
  ruleId: string,
  fires: boolean,
  context: string
): Promise<void> {
  const messages = await lintSnippet(config, code, filePath)
  if (fires) expectMessageForRule(messages, ruleId, context)
  else expectNoMessageForRule(messages, ruleId, context)
}
