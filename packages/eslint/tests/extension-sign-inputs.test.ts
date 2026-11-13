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
import { afterAll, describe, expect, it } from "vitest"
import { isMap, isScalar, isSeq, parseAllDocuments } from "yaml"

const ROOT = fileURLToPath(new URL("../../../", import.meta.url))
const FILE = ".github/workflows/extension-sign-manual.yml"
const text = readFileSync(join(ROOT, FILE), "utf8")

/**
 * Every expression the file may hold, by where it sits and what it says.
 * Each is a value GitHub reads as data, never a script.
 */
const ALLOWED: ReadonlyArray<string> = [
  "jobs.preflight.steps.0.if = ${{ inputs.compliance_confirmed != true }}",
  "jobs.preflight.steps.1.env.EXTENSION = ${{ inputs.extension }}",
  "jobs.preflight.steps.1.env.COMPLIANCE_CONFIRMED = ${{ inputs.compliance_confirmed }}",
  "jobs.build-matrix.outputs.matrix = ${{ steps.matrix.outputs.matrix }}",
  "jobs.build-matrix.steps.1.env.EXTENSION = ${{ inputs.extension }}",
  "jobs.sign.name = Sign ${{ inputs.extension }}",
  "jobs.sign.with.matrix = ${{ needs.build-matrix.outputs.matrix }}",
]

/** The workflow's one document as YAML decodes it; null if unreadable. */
function parsed(yaml: string): unknown {
  const docs = parseAllDocuments(yaml)
  if (!Array.isArray(docs) || docs.length !== 1) return null
  const [doc] = docs
  if (!doc || doc.errors.length > 0 || doc.warnings.length > 0) return null
  return doc.contents
}

/**
 * Every decoded key or value holding `${{`, as `path = value`. Escapes, line
 * continuations, anchors and flow style are all decoded first.
 */
function expressions(yaml: string): Array<string> | null {
  const root = parsed(yaml)
  if (root === null) return null
  const found: Array<string> = []
  const walk = (node: unknown, path: string): void => {
    if (isMap(node)) {
      for (const pair of node.items) {
        const key = isScalar(pair.key) ? String(pair.key.value) : "?"
        if (key.includes("${{")) found.push(`${path} key = ${key}`)
        walk(pair.value, path === "" ? key : `${path}.${key}`)
      }
    } else if (isSeq(node)) {
      node.items.forEach((item, i) => {
        walk(item, `${path}.${String(i)}`)
      })
    } else if (isScalar(node) && String(node.value).includes("${{")) {
      found.push(`${path} = ${String(node.value)}`)
    }
  }
  walk(root, "")
  return found
}

/** Each expression not listed in its place; one line if unreadable. */
function stray(yaml: string): Array<string> {
  const found = expressions(yaml)
  if (found === null) return ["the workflow is not one readable document"]
  return found.filter((e) => !ALLOWED.includes(e))
}

/** The decoded `run:` of the step named `name`. Empty if absent. */
function scriptOf(name: string): string {
  let script = ""
  const walk = (node: unknown): void => {
    if (isSeq(node)) node.items.forEach(walk)
    if (!isMap(node)) return
    if (node.get("name") === name && typeof node.get("run") === "string")
      script = String(node.get("run"))
    for (const pair of node.items) walk(pair.value)
  }
  walk(parsed(text))
  return script
}

describe("WS1: extension-sign-manual.yml", () => {
  it("holds an expression only where GitHub reads it as data", () => {
    expect(expressions(text)).toHaveLength(ALLOWED.length)
    expect(stray(text)).toEqual([])
  })

  const step = "printf 'Signing extension: %q\\n' \"$EXTENSION\""
  it.each([
    [
      "an input inside a script",
      `${step}\n          echo "\${{ inputs.extension }}"`,
    ],
    [
      "an env block written inside a script",
      `${step}\n          env:\n            EXTENSION: \${{ inputs.extension }}`,
    ],
    [
      "a flow-style step",
      `${step}\n      - { run: "echo \${{ env.EXTENSION }}" }`,
    ],
    [
      "an escaped dollar",
      `${step}\n      - run: "echo \\x24{{ inputs.extension }}"`,
    ],
    [
      "an escaped line break",
      `${step}\n      - run: "echo $\\\n          {{ inputs.extension }}"`,
    ],
    [
      "an env block inside another action's script",
      `${step}\n      - uses: actions/github-script@v7\n        with:\n          script: |\n            env:\n              EXTENSION: \${{ inputs.extension }}`,
    ],
  ])("fails %s", (_, replacement) => {
    const tainted = text.replace(step, replacement)
    expect(tainted).not.toEqual(text)
    expect(stray(tainted)).toHaveLength(1)
  })

  it("fails a file it cannot read as one document", () => {
    expect(stray(`${text}\n---\nx: 1\n`)).toHaveLength(1)
    expect(stray(`${text}\n  : [\n`)).toHaveLength(1)
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
