/**
 * tests/helpers/eslint-resolver.ts
 *
 * Wraps ESLint's real APIs so every test suite uses the actual flat-config
 * resolution engine rather than a hand-rolled simulator.
 *
 * Two primitives:
 *
 *   calculateConfig(config, filePath)
 *     → the merged rule map ESLint would apply to that file.
 *       Uses ESLint.calculateConfigForFile() internally.
 *       Fast — no parsing, no rule execution.
 *       REQUIRES the file to physically exist on disk.
 *       Use a fixture stub from tests/fixtures/.
 *
 *   lintSnippet(config, code, filePath)
 *     → the lint messages ESLint produces for that in-memory code snippet,
 *       treated as if located at filePath (controls which config globs apply).
 *       Uses ESLint.lintText() internally.
 *       Does NOT require the file to exist on disk.
 */

import path from "node:path"
import { fileURLToPath } from "node:url"
import { ESLint } from "eslint"
import type { Linter } from "eslint"

// Resolve to packages/eslint/ so projectService tsconfig discovery works.
// import.meta.url points to this source file:
//   packages/eslint/tests/helpers/eslint-resolver.ts
// Three parent hops: helpers/ → tests/ → packages/eslint/
const PACKAGE_ROOT = path.resolve(fileURLToPath(import.meta.url), "../../..")

// ── Path safety ───────────────────────────────────────────────────────────────
//
// Resolves filePath relative to PACKAGE_ROOT and rejects anything that would
// escape the package directory (e.g. ../../../../etc/passwd style traversal).

function resolveSafePath(filePath: string): string {
  const abs = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(PACKAGE_ROOT, filePath)

  const rel = path.relative(PACKAGE_ROOT, abs)

  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(
      `Refusing to resolve path outside PACKAGE_ROOT.\n` +
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
export type Severity = 0 | 1 | 2

// ── calculateConfig ───────────────────────────────────────────────────────────
//
// Returns the effective rule map that ESLint would apply to `filePath` under
// the given config array. The file must exist on disk — ESLint stats it
// during config resolution. Use a fixture stub from tests/fixtures/.
//
// Why overrideConfig: config (not wrapped in []):
//   ESLint accepts a flat config array directly. Wrapping in another array
//   can diverge from defineConfig() semantics when the shape is already a
//   normalized readonly array.

export async function calculateConfig(
  config: Linter.Config | Array<Linter.Config>,
  filePath: string
): Promise<EffectiveRules> {
  const absPath = resolveSafePath(filePath)

  const eslint = new ESLint({
    cwd: PACKAGE_ROOT,
    // Ignore any eslint.config.js on disk — test in isolation
    overrideConfigFile: true,
    overrideConfig: config,
  })

  console.log("absPath", absPath)
  const calculated = await eslint.calculateConfigForFile(absPath)

  if (calculated === undefined || calculated.rules === undefined) {
    console.error("calculated is undefined", calculated)
    throw new Error(
      `ESLint.calculateConfigForFile() returned no config for:\n` +
        `  ${absPath}\n\n` +
        `Possible causes:\n` +
        `  1. File does not exist on disk (required by this API).\n` +
        `     Create a stub: echo 'export {}' > ${absPath}\n` +
        `  2. The path matches an 'ignores' glob in the config.\n` +
        `     Check base.config.ts ignores block.\n` +
        `  3. No config block's files[] glob matched this extension.\n` +
        `  4. PACKAGE_ROOT resolved incorrectly: ${PACKAGE_ROOT}`
    )
  }

  return calculated.rules as EffectiveRules
}

// ── lintSnippet ───────────────────────────────────────────────────────────────
//
// Lints an in-memory code string treated as if located at `filePath`.
// The file does NOT need to exist on disk — lintText accepts virtual paths.
// filePath controls which config block globs match (*.ts vs *.js etc.).

export async function lintSnippet(
  config: Linter.Config | Array<Linter.Config>,
  code: string,
  filePath: string
): Promise<Array<LintMessage>> {
  const absPath = resolveSafePath(filePath)

  const eslint = new ESLint({
    cwd: PACKAGE_ROOT,
    overrideConfigFile: true,
    overrideConfig: config,
  })

  const [result] = await eslint.lintText(code, { filePath: absPath })
  return result?.messages ?? []
}

// ── Severity normalisation ────────────────────────────────────────────────────

export function severityOf(entry: Linter.RuleEntry | undefined): Severity {
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
        `  Got: ${rules[ruleName] === undefined ? "not present — possible typo or missing config assembly" : `severity ${sev} — ${JSON.stringify(rules[ruleName])}`}`
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
