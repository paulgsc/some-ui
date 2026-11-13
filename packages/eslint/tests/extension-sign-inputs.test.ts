/**
 * WS1 (docs/ci-architecture.md, "Inputs reach the shell as data"): the manual
 * sign workflow's free-text `extension` input reaches a `run:` script only as
 * an `env:` variable, and the matrix it builds holds a name read from the
 * repository, never the input's own text (#2116).
 *
 * Family: every string a dispatcher can type (shell metacharacters, a path, a
 * newline, empty), over each step that reads the input. The first cases hold
 * that no `run:` script in the file expands any `${{ }}` at all, whatever it
 * reads or however it is spelled, and that the input appears only where
 * GitHub reads it as data; the last run the step that admits the input, its
 * own script as written in the workflow, over a sample of that family.
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

const indent = (l: string): number => l.search(/\S/)

/**
 * Every `run:` script in `yaml`, by the line it starts on: an inline value,
 * or a block scalar (`|`, `>`, with any chomping) dedented.
 */
function runScripts(yaml: string): Array<{ line: number; script: string }> {
  const lines = yaml.split("\n")
  return lines.flatMap((l, i) => {
    const run = /^(\s*)(?:- )?run:\s*(.*)$/.exec(l)
    if (!run) return []
    const value = run[2] ?? ""
    if (!/^[|>][+-]?\d*\s*(?:#.*)?$/.test(value))
      return [{ line: i + 1, script: value }]
    const after = lines.slice(i + 1)
    const close = after.findIndex(
      (b) => b.trim() !== "" && indent(b) <= indent(l)
    )
    const body = close < 0 ? after : after.slice(0, close)
    const pad = Math.min(...body.filter((b) => b.trim() !== "").map(indent))
    return [{ line: i + 1, script: body.map((b) => b.slice(pad)).join("\n") }]
  })
}

/** The `run:` lines whose script expands a `${{ }}` expression. */
function expanding(yaml: string): Array<number> {
  return runScripts(yaml)
    .filter(({ script }) => script.includes("${{"))
    .map(({ line }) => line)
}

/** The script of the step named `name`. Empty if absent. */
function scriptOf(name: string): string {
  const lines = text.split("\n")
  const start = lines.findIndex((l) => l.trim() === `- name: ${name}`)
  if (start < 0) return ""
  const stepIndent = indent(lines[start] ?? "")
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((l) => l.trim() !== "" && indent(l) <= stepIndent)
  const last = start + 1 + (end < 0 ? rest.length : end)
  return (
    runScripts(text).find(({ line }) => line > start && line <= last)?.script ??
    ""
  )
}

describe("WS1: extension-sign-manual.yml", () => {
  it("expands no ${{ }} expression inside any run: script", () => {
    // Can't pass by reading nothing: the file's scripts are found.
    expect(runScripts(text).length).toBeGreaterThanOrEqual(4)
    expect(expanding(text)).toEqual([])
  })

  it.each([
    ["an input by dot", 'echo "${{ inputs.extension }}"'],
    ["an input by bracket", "echo \"${{ inputs['extension'] }}\""],
    ["the env variable re-expanded", 'echo "${{ env.EXTENSION }}"'],
    ["every input as JSON", "echo '${{ toJSON(inputs) }}'"],
    ["the event's inputs", "echo ${{ github.event.inputs.extension }}"],
  ])("fails a run: script that expands %s", (_, line) => {
    const tainted = text.replace(
      "printf 'Signing extension: %q\\n' \"$EXTENSION\"",
      `printf 'Signing extension: %q\\n' "$EXTENSION"\n          ${line}`
    )
    expect(tainted).not.toEqual(text)
    expect(expanding(tainted)).toHaveLength(1)
    const inline = text.replace("exit 1\n", `exit 1\n      - run: ${line}\n`)
    expect(inline).not.toEqual(text)
    expect(expanding(inline)).toHaveLength(1)
  })

  it("names an input only as an env value, an if, or a job name", () => {
    const named = text
      .split("\n")
      .filter((l) => /\binputs\b/.test(l) && l.includes("${{"))
    expect(named.length).toBeGreaterThan(0)
    const allowed =
      /^\s+(?:[A-Z_]+: \$\{\{ inputs\.\w+ \}\}|if: \$\{\{ inputs\.\w+ != true \}\}|name: Sign \$\{\{ inputs\.extension \}\})$/
    expect(named.filter((l) => !allowed.test(l))).toEqual([])
  })

  describe("the Resolve extension metadata step", () => {
    const script = scriptOf("Resolve extension metadata")
    const scratch = mkdtempSync(join(tmpdir(), "ws1-"))
    afterAll(() => rmSync(scratch, { recursive: true, force: true }))

    function resolve(extension: string): { ok: boolean; output: string } {
      const out = join(scratch, "output")
      rmSync(out, { force: true })
      // GitHub's own shell for a `run:` on Linux.
      const run = spawnSync(
        "bash",
        ["--noprofile", "--norc", "-eo", "pipefail", "-c", script],
        {
          cwd: ROOT,
          env: {
            PATH: process.env.PATH,
            EXTENSION: extension,
            GITHUB_OUTPUT: out,
          },
          encoding: "utf8",
        }
      )
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
