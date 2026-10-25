import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { dirname, join } from "path"
import { checkContract, contractSource } from "@/audience/contract.js"
import { afterEach, describe, expect, it } from "vitest"

const MANIFEST = JSON.stringify({ exports: { ".": {}, "./contract": {} } })
const CONFIG = 'createViteConfig({ entries: { contract: "src/contract.ts" } })'

let dirs: Array<string> = []
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  dirs = []
})

/** A workspace on disk exporting ./contract from src/contract.ts. */
function workspace(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "contract-"))
  dirs.push(dir)
  const all = {
    "package.json": MANIFEST,
    "vite.config.ts": CONFIG,
    ...files,
  }
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  return dir
}
const problemsOf = (
  contract: string,
  more: Record<string, string> = {}
): Array<string> =>
  checkContract(workspace({ "src/contract.ts": contract, ...more })).problems

describe("checkContract: what a contract may import", () => {
  it("accepts type imports, zod, and relative modules that do the same", () => {
    expect(
      problemsOf(
        [
          'export { LIMIT } from "./lib/policy"',
          'export type { Take } from "./lib/types"',
          'import type { Foo } from "@some-ui/types"',
          'import { z } from "zod"',
        ].join("\n"),
        {
          "src/lib/policy.ts":
            'import type { Take } from "./types"\nexport const LIMIT = 1',
          "src/lib/types.ts": "export type Take = { ms: number }",
        }
      )
    ).toEqual([])
  })

  it("names a value import of another package, with file and line, in any module of the graph", () => {
    const problems = problemsOf('export * from "./a"', {
      "src/a.ts": 'import type { A } from "x"\nimport { b } from "react"',
    })
    expect(problems).toEqual([
      expect.stringMatching(/src\/a\.ts:2: a value import of "react"/),
    ])
    expect(problems[0]).toContain("import type")
  })

  it("reads every form that stays in the output as a value import", () => {
    for (const line of [
      'import "side-effect"',
      'import def from "pkg"',
      'import { type A, b } from "pkg"',
      'import * as ns from "pkg"',
      'export { a } from "pkg"',
      'export * from "pkg"',
      'export * as ns from "pkg"',
      'const m = import("pkg")',
      'import fs = require("pkg")',
    ]) {
      expect(problemsOf(line), line).toHaveLength(1)
    }
  })

  it("reads every form the build erases as a type import", () => {
    for (const line of [
      'import type { A } from "pkg"',
      'import type A from "pkg"',
      'import type * as ns from "pkg"',
      'import { type A } from "pkg"',
      'export type { A } from "pkg"',
      'export { type A } from "pkg"',
      'export type * from "pkg"',
    ]) {
      expect(problemsOf(line), line).toEqual([])
    }
  })

  it("accepts zod and no other specifier", () => {
    expect(problemsOf('import { z } from "zod"')).toEqual([])
    for (const specifier of ["zod/v4", "zodiac", "@soundbites/lib/policy"]) {
      expect(
        problemsOf(`import { z } from "${specifier}"`),
        specifier
      ).toHaveLength(1)
    }
  })

  it("cannot follow an import() with no literal specifier, or an import.meta.glob", () => {
    for (const line of [
      "const m = import(name)",
      'const m = import.meta.glob("./impl/*.ts", { eager: true })',
    ]) {
      const problems = problemsOf(line)
      expect(problems, line).toEqual([
        expect.stringMatching(
          /src\/contract\.ts:1: an import the contract graph cannot follow/
        ),
      ])
    }
  })
})

describe("checkContract: the graph", () => {
  it("follows relative imports, type imports included, to any depth", () => {
    expect(
      problemsOf('import type { A } from "./a"', {
        "src/a.ts": 'export { b } from "./b"',
        "src/b.ts": 'import { c } from "lodash"\nexport const b = 1',
      })
    ).toEqual([expect.stringContaining("src/b.ts:1:")])
  })

  it("visits a module once, cycles included", () => {
    expect(
      problemsOf('export * from "./a"\nexport * from "./b"', {
        "src/a.ts": 'import "pkg"\nexport * from "./b"',
        "src/b.ts": 'export * from "./a"',
      })
    ).toEqual([expect.stringContaining("src/a.ts:1:")])
  })

  it("fails a relative import that is not a TypeScript module", () => {
    expect(
      problemsOf('import data from "./data.json"', {
        "src/data.json": "{}",
      })
    ).toEqual([expect.stringContaining('cannot resolve "./data.json"')])
  })

  it("fails a contract whose source file is not there", () => {
    const dir = workspace({})
    expect(checkContract(dir).problems).toEqual([
      expect.stringContaining("cannot be checked"),
    ])
  })
})

describe("contractSource", () => {
  const withContract = { exports: { ".": {}, "./contract": {} } }

  it("is none for a workspace that exports no ./contract", () => {
    expect(contractSource({}, null)).toEqual({ kind: "none" })
    expect(contractSource({ exports: { ".": {} } }, "x")).toEqual({
      kind: "none",
    })
  })

  it("reads entries.contract, whatever else surrounds it", () => {
    for (const config of [
      "createViteConfig({ entries: { contract: 'src/contract.ts' } })",
      'createViteConfig({ entries: { "contract": "src/contract.ts" } })',
      'createViteConfig({ entries: { http: "src/http.ts", contract: "src/contract.ts" } })',
      '// entries: { contract: "src/old.ts" }\ncreateViteConfig({ entries: { contract: "src/contract.ts" } })',
    ]) {
      expect(contractSource(withContract, config), config).toEqual({
        kind: "source",
        path: "src/contract.ts",
      })
    }
  })

  it("does not pass what it cannot trace to one string", () => {
    for (const config of [
      null,
      "createViteConfig({ packageName: 'x' })",
      'createViteConfig({ entries: { http: "src/http.ts" } })',
      "createViteConfig({ entries: ENTRIES })",
      'createViteConfig({ entries: { contract: "src/" + "contract.ts" } })',
      'createViteConfig({ entries: { subcontract: "src/c.ts" } })',
      'a({ entries: { contract: "src/a.ts" } }); b({ entries: { contract: "src/b.ts" } })',
    ]) {
      expect(contractSource(withContract, config).kind, String(config)).toBe(
        "unresolved"
      )
    }
  })
})

describe("checkContract: which workspaces", () => {
  it("is quiet for a workspace with no contract", () => {
    const dir = workspace({ "package.json": "{}" })
    expect(checkContract(dir)).toEqual({ exported: false, problems: [] })
  })

  it("fails a contract whose source it cannot find", () => {
    const dir = workspace({ "vite.config.ts": "createViteConfig({})" })
    const checked = checkContract(dir)
    expect(checked.exported).toBe(true)
    expect(checked.problems).toEqual([
      expect.stringContaining("A2 cannot be checked"),
    ])
  })
})
