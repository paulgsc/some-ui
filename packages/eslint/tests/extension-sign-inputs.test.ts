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
import {
  isAlias,
  isMap,
  isNode,
  isScalar,
  isSeq,
  parseAllDocuments,
} from "yaml"

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
 * continuations and flow style are decoded first. An anchor, an alias or a
 * key that is not a plain scalar is refused outright: each can place one
 * value under a second path the list never names.
 */
function expressions(yaml: string): Array<string> | null {
  const root = parsed(yaml)
  if (root === null) return null
  const found: Array<string> = []
  const walk = (node: unknown, path: string): void => {
    if (isAlias(node) || (isNode(node) && node.anchor !== undefined)) {
      found.push(`${path} is an anchor or alias`)
      return
    }
    if (isMap(node)) {
      for (const pair of node.items) {
        if (!isScalar(pair.key) || pair.key.anchor !== undefined) {
          found.push(`${path} has a key that is not plain text`)
          continue
        }
        const key = String(pair.key.value)
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

  // Inside the preflight step's script, and as a new step after it.
  const script = "printf 'Signing extension: %q\\n' \"$EXTENSION\""
  const nextJob = "\n  build-matrix:\n"
  it.each([
    [
      "an input inside a script",
      script,
      `${script}\n          echo "\${{ inputs.extension }}"`,
      ["jobs.preflight.steps.1.run = "],
    ],
    [
      "an env block written inside a script",
      script,
      `${script}\n          env:\n            EXTENSION: \${{ inputs.extension }}`,
      ["jobs.preflight.steps.1.run = "],
    ],
    [
      "a flow-style step",
      nextJob,
      `\n      - { run: "echo \${{ env.EXTENSION }}" }${nextJob}`,
      ["jobs.preflight.steps.2.run = echo ${{ env.EXTENSION }}"],
    ],
    [
      "an escaped dollar",
      nextJob,
      `\n      - run: "echo \\x24{{ inputs.extension }}"${nextJob}`,
      ["jobs.preflight.steps.2.run = echo ${{ inputs.extension }}"],
    ],
    [
      "an escaped line break",
      nextJob,
      `\n      - run: "echo $\\\n          {{ inputs.extension }}"${nextJob}`,
      ["jobs.preflight.steps.2.run = echo ${{ inputs.extension }}"],
    ],
    [
      "an env block inside another action's script",
      nextJob,
      `\n      - uses: actions/github-script@v7\n        with:\n          script: |\n            env:\n              EXTENSION: \${{ inputs.extension }}${nextJob}`,
      ["jobs.preflight.steps.2.with.script = "],
    ],
    [
      "an anchored value aliased into a script",
      nextJob,
      `\n      - env:\n          X: &a \${{ inputs.extension }}\n      - run: *a${nextJob}`,
      [
        "jobs.preflight.steps.2.env.X is an anchor or alias",
        "jobs.preflight.steps.3.run is an anchor or alias",
      ],
    ],
    [
      "a key that is not plain text",
      nextJob,
      `\n      - ? [ "\${{ inputs.extension }}" ]\n        : x${nextJob}`,
      ["jobs.preflight.steps.2 has a key that is not plain text"],
    ],
  ])("fails %s", (_, at, replacement, expected) => {
    const tainted = text.replace(at, replacement)
    expect(tainted).not.toEqual(text)
    const found = stray(tainted)
    expect(found).toHaveLength(expected.length)
    expected.forEach((start, i) => {
      expect(found[i]?.startsWith(start)).toBe(true)
    })
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
