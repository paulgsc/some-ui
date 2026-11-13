/**
 * WS1 (docs/ci-architecture.md, "Inputs reach the shell as data"): the manual
 * sign workflow's free-text `extension` input reaches a `run:` script only as
 * an `env:` variable, and the matrix it builds holds a name read from the
 * repository, never the input's own text (#2116).
 *
 * Family: every string a dispatcher can type (shell metacharacters, a path, a
 * newline, empty), over each step that reads the input.
 */

import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { indentOf } from "@eslint/workflow-guards.js"
import { afterAll, describe, expect, it } from "vitest"

const ROOT = fileURLToPath(new URL("../../../", import.meta.url))
const FILE = ".github/workflows/extension-sign-manual.yml"
const text = readFileSync(join(ROOT, FILE), "utf8")

/**
 * Every expression the file may hold, each with the key it must sit under
 * and no `run:` above it. Listing lines rather than parsing out scripts
 * leaves no YAML shape (a quoted scalar over two lines, an anchor, a
 * flow-style step) that can carry one into a script unseen; `ESCAPED` closes
 * the one spelling that is not `${{` in the raw text.
 */
const ALLOWED: ReadonlyArray<[line: string, parent: string]> = [
  [
    "if: ${{ inputs.compliance_confirmed != true }}",
    "- name: Fail if compliance not confirmed",
  ],
  ["EXTENSION: ${{ inputs.extension }}", "env:"],
  ["COMPLIANCE_CONFIRMED: ${{ inputs.compliance_confirmed }}", "env:"],
  ["matrix: ${{ steps.matrix.outputs.matrix }}", "outputs:"],
  ["name: Sign ${{ inputs.extension }}", "sign:"],
  ["matrix: ${{ needs.build-matrix.outputs.matrix }}", "with:"],
]

/** A YAML escape for `$` or `{`, which a quoted scalar decodes. */
const ESCAPED = /\\(?:x24|x7b|u0024|u007b|U00000024|U0000007b)/i

/** The lines above `i` that hold it, nearest first, each indented less. */
function ancestorsOf(lines: ReadonlyArray<string>, i: number): Array<string> {
  const found: Array<string> = []
  let own = indentOf(lines[i] ?? "")
  for (let j = i - 1; j >= 0 && own > 0; j--) {
    const l = lines[j] ?? ""
    if (l.trim() === "" || indentOf(l) >= own) continue
    found.push(l.trim())
    own = indentOf(l)
  }
  return found
}

/** Each line holding `${{` that is not an allowed expression in its place. */
function stray(yaml: string): Array<string> {
  const lines = yaml.split("\n")
  return lines.flatMap((l, i) => {
    if (ESCAPED.test(l)) return [`${String(i + 1)}: ${l.trim()}`]
    if (!l.includes("${{")) return []
    const above = ancestorsOf(lines, i)
    const ok =
      !above.some((a) => /^(?:- )?run:/.test(a)) &&
      ALLOWED.some(([line, parent]) => l.trim() === line && above[0] === parent)
    return ok ? [] : [`${String(i + 1)}: ${l.trim()}`]
  })
}

/** The `run: |` script of the step named `name`, dedented. Empty if absent. */
function scriptOf(name: string): string {
  const lines = text.split("\n")
  const start = lines.findIndex((l) => l.trim() === `- name: ${name}`)
  const run = lines.findIndex((l, i) => i > start && l.trim() === "run: |")
  const between = lines.slice(start + 1, run)
  if (start < 0 || run < 0 || between.some((l) => l.trim().startsWith("- ")))
    return ""
  const after = lines.slice(run + 1)
  const close = after.findIndex(
    (l) => l.trim() !== "" && indentOf(l) <= indentOf(lines[run] ?? "")
  )
  const body = close < 0 ? after : after.slice(0, close)
  const pad = Math.min(
    ...body.filter((l) => l.trim() !== "").map((l) => indentOf(l))
  )
  return body.map((l) => l.slice(pad)).join("\n")
}

describe("WS1: extension-sign-manual.yml", () => {
  it("holds an expression only where GitHub reads it as data", () => {
    expect(text.split("${{").length - 1).toBe(7)
    expect(stray(text)).toEqual([])
  })

  const step = "printf 'Signing extension: %q\\n' \"$EXTENSION\""
  it.each([
    [
      "an input inside a script",
      `${step}\n          echo "\${{ inputs.extension }}"`,
    ],
    [
      "an env line's copy inside a script",
      `${step}\n          EXTENSION: \${{ inputs.extension }}`,
    ],
    [
      "an env block written inside a script",
      `${step}\n          env:\n            EXTENSION: \${{ inputs.extension }}`,
    ],
    [
      "an escaped expression",
      `${step}\n      - run: "echo \\x24{{ inputs.extension }}"`,
    ],
    ["an inline run:", `${step}\n      - run: echo \${{ env.EXTENSION }}`],
    [
      "a quoted run: over two lines",
      `${step}\n      - run: "echo a\n          \${{ toJSON(inputs) }}"`,
    ],
  ])("fails %s", (_, replacement) => {
    const tainted = text.replace(step, replacement)
    expect(tainted).not.toEqual(text)
    expect(stray(tainted)).toHaveLength(1)
  })

  describe("the Resolve extension metadata step", () => {
    const script = scriptOf("Resolve extension metadata")
    const scratch = mkdtempSync(join(tmpdir(), "ws1-"))
    afterAll(() => rmSync(scratch, { recursive: true, force: true }))

    function resolve(extension: string): { ok: boolean; output: string } {
      const out = join(scratch, "output")
      rmSync(out, { force: true })
      // A step with no `shell:` runs as `bash -e {0}`.
      const run = spawnSync("bash", ["-e", "-c", script], {
        cwd: ROOT,
        env: {
          PATH: process.env.PATH,
          EXTENSION: extension,
          GITHUB_OUTPUT: out,
        },
        encoding: "utf8",
      })
      return {
        ok: run.status === 0,
        output: existsSync(out) ? readFileSync(out, "utf8") : "",
      }
    }

    it("builds the matrix for an extension that ships a manifest", () => {
      const { ok, output } = resolve("suspender-ledger")
      expect(ok).toBe(true)
      const matrix = JSON.parse(output.replace(/^matrix=/, ""))
      expect(matrix.include).toEqual([
        {
          extension_name: "suspender-ledger",
          extension_path: "extensions/suspender-ledger",
          package_name: "@some-extension/suspender-ledger",
        },
      ])
    })

    const marker = join(scratch, "ran")
    it.each([
      ["a shared-code workspace with no manifest", "common"],
      ["a command substitution", `$(touch ${marker})`],
      ["a quote and a second command", `suspender-ledger"; touch ${marker}; "`],
      ["a path out of extensions/", "../packages/eslint"],
      ["a newline before a workflow command", "x\n::set-output name=m::y"],
      ["a known name with trailing space", "suspender-ledger "],
      ["the empty string", ""],
    ])("refuses %s and writes no matrix", (_, extension) => {
      const { ok, output } = resolve(extension)
      expect(ok).toBe(false)
      expect(output).toBe("")
      expect(existsSync(marker)).toBe(false)
    })
  })
})
