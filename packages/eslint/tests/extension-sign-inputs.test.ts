/**
 * WI1 (docs/ci-architecture.md, "Inputs reach the shell as data"): the manual
 * sign workflow's free-text `extension` input reaches a `run:` script only as
 * an `env:` variable, and the matrix it builds holds a name read from the
 * repository, never the input's own text (#2116).
 *
 * Family: every string a dispatcher can type (shell metacharacters, a path, a
 * newline, empty), over each step that reads the input. The first case reads
 * every line of the file that names an input; the second runs the step's own
 * script, as written in the workflow, over a sample of that family.
 */

import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, describe, expect, it } from "vitest"

const ROOT = fileURLToPath(new URL("../../../", import.meta.url))
const FILE = ".github/workflows/extension-sign-manual.yml"
const text = readFileSync(join(ROOT, FILE), "utf8")
const lines = text.split("\n")

/** The `run: |` block of the step named `name`, dedented. Empty if absent. */
function runBlock(name: string): string {
  const indent = (l: string): number => l.search(/\S/)
  const start = lines.findIndex((l) => l.trim() === `- name: ${name}`)
  if (start < 0) return ""
  const stepIndent = indent(lines[start] ?? "")
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((l) => l.trim() !== "" && indent(l) <= stepIndent)
  const step = end < 0 ? rest : rest.slice(0, end)
  const run = step.findIndex((l) => l.trim() === "run: |")
  if (run < 0) return ""
  const runIndent = indent(step[run] ?? "")
  const after = step.slice(run + 1)
  const close = after.findIndex(
    (l) => l.trim() !== "" && indent(l) <= runIndent
  )
  const body = close < 0 ? after : after.slice(0, close)
  const pad = Math.min(...body.filter((l) => l.trim() !== "").map(indent))
  return body.map((l) => l.slice(pad)).join("\n")
}

describe("WI1: extension-sign-manual.yml", () => {
  it("names an input only as an env value, an if, or a job name", () => {
    const named = lines
      .map((l, i) => ({ l, line: i + 1 }))
      .filter(({ l }) => /\binputs\./.test(l) && l.includes("${{"))
    // Can't pass by reading nothing: the file does use its inputs.
    expect(named.length).toBeGreaterThan(0)
    const allowed =
      /^\s+(?:[A-Z_]+: \$\{\{ inputs\.\w+ \}\}|if: \$\{\{ inputs\.\w+ != true \}\}|name: Sign \$\{\{ inputs\.extension \}\})$/
    expect(named.filter(({ l }) => !allowed.test(l))).toEqual([])
    expect(text).not.toMatch(/github\.event\.inputs/)
  })

  describe("the Resolve extension metadata step", () => {
    const script = runBlock("Resolve extension metadata")
    const scratch = mkdtempSync(join(tmpdir(), "wi1-"))
    afterAll(() => rmSync(scratch, { recursive: true, force: true }))

    function resolve(extension: string): { ok: boolean; output: string } {
      const out = join(scratch, "output")
      rmSync(out, { force: true })
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

    it("is the script the workflow runs, and it reads $EXTENSION", () => {
      expect(script).toContain('"$EXTENSION"')
      expect(script).toContain('>> "$GITHUB_OUTPUT"')
    })

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
      ["a backtick substitution", `\`touch ${marker}\``],
      ["a quote and a second command", `suspender-ledger"; touch ${marker}; "`],
      ["a path out of extensions/", "../packages/eslint"],
      ["a path into an extension", "suspender-ledger/src"],
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
