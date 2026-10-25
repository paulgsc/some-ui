import {
  checkContract,
  contractSource,
  walkContract,
} from "@/audience/contract.js"
import { describe, expect, it } from "vitest"

// A workspace on an in-memory disk: path -> text.
function disk(files: Record<string, string>): (path: string) => string | null {
  return (path) => files[path] ?? null
}
const ENTRY = "/ws/src/contract.ts"
const walk = (files: Record<string, string>): Array<string> =>
  walkContract(ENTRY, disk(files))

describe("walkContract: what a contract may import", () => {
  it("accepts type imports, zod, and relative modules that do the same", () => {
    expect(
      walk({
        [ENTRY]: [
          'export { LIMIT } from "./lib/policy"',
          'export type { Take } from "./lib/types"',
          'import type { Foo } from "@some-ui/types"',
          'import { z } from "zod"',
          'import { z as z4 } from "zod/v4"',
        ].join("\n"),
        "/ws/src/lib/policy.ts":
          'import type { Take } from "./types"\nexport const LIMIT = 1',
        "/ws/src/lib/types.ts": "export type Take = { ms: number }",
      })
    ).toEqual([])
  })

  it("names a value import of any other package, with file and line", () => {
    const problems = walk({
      [ENTRY]: 'import type { A } from "x"\nimport { b } from "react"\n',
    })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain(`${ENTRY}:2:`)
    expect(problems[0]).toContain('"react"')
    expect(problems[0]).toContain("import type")
  })

  it("reads every form that stays in the output as a value import", () => {
    for (const line of [
      'import "side-effect"',
      'import def from "pkg"',
      'import { type A } from "pkg"',
      'import * as ns from "pkg"',
      'export { a } from "pkg"',
      'export { type A } from "pkg"',
      'export * from "pkg"',
      'export * as ns from "pkg"',
      'const m = import("pkg")',
      'const m = require("pkg")',
      'import fs = require("pkg")',
    ]) {
      expect(walk({ [ENTRY]: line }), line).toHaveLength(1)
    }
  })

  it("reads every form that is erased as a type import", () => {
    for (const line of [
      'import type { A } from "pkg"',
      'import type A from "pkg"',
      'import type * as ns from "pkg"',
      'export type { A } from "pkg"',
      'export type * from "pkg"',
      'type T = import("pkg").A',
    ]) {
      expect(walk({ [ENTRY]: line }), line).toEqual([])
    }
  })

  it("accepts zod and its subpaths only", () => {
    expect(walk({ [ENTRY]: 'import { z } from "zod/mini"' })).toEqual([])
    expect(walk({ [ENTRY]: 'import { z } from "zodiac"' })).toHaveLength(1)
    expect(walk({ [ENTRY]: 'import { z } from "@zod/core"' })).toHaveLength(1)
  })

  it("names an alias import, since only relative ones are the graph's own", () => {
    const problems = walk({
      [ENTRY]: 'import { LIMIT } from "@soundbites/lib/policy"',
    })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain("@soundbites/lib/policy")
  })

  it("cannot check an import() or require() it cannot read", () => {
    const problems = walk({ [ENTRY]: "const m = import(name)" })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain(`${ENTRY}:1:`)
    expect(problems[0]).toContain("not a string literal")
  })
})

describe("walkContract: the graph", () => {
  it("follows relative imports, type imports included, to any depth", () => {
    const problems = walk({
      [ENTRY]: 'import type { A } from "./a"',
      "/ws/src/a.ts": 'export { b } from "./b"',
      "/ws/src/b.ts": 'import { c } from "lodash"\nexport const b = 1',
    })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain("/ws/src/b.ts:1:")
  })

  it("resolves .js specifiers, index files and .tsx", () => {
    expect(
      walk({
        [ENTRY]: 'import "./a.js"\nimport "./dir"\nimport "./view"',
        "/ws/src/a.ts": 'import "x"',
        "/ws/src/dir/index.ts": 'import "y"',
        "/ws/src/view.tsx": 'import "z"',
      })
    ).toHaveLength(3)
  })

  it("visits a module once, cycles included", () => {
    expect(
      walk({
        [ENTRY]: 'export * from "./a"\nexport * from "./b"',
        "/ws/src/a.ts": 'import "pkg"\nexport * from "./b"',
        "/ws/src/b.ts": 'export * from "./a"',
      })
    ).toEqual([expect.stringContaining("/ws/src/a.ts:1:")])
  })

  it("cannot check a relative import that is not a TypeScript module", () => {
    for (const specifier of ["./missing", "./data.json", "./styles.css"]) {
      const problems = walk({ [ENTRY]: `import "${specifier}"` })
      expect(problems, specifier).toHaveLength(1)
      expect(problems[0]).toContain(specifier)
    }
  })

  it("names an entry that is not there", () => {
    expect(walkContract(ENTRY, disk({}))).toEqual([
      expect.stringContaining(`${ENTRY}: the contract graph reaches this file`),
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

  it("reads entries.contract in either quote style", () => {
    for (const config of [
      'createViteConfig({ entries: { contract: "src/contract.ts" } })',
      "createViteConfig({ entries: { contract: 'src/contract.ts' } })",
      'createViteConfig({ entries: { "contract": "src/contract.ts" } })',
      'createViteConfig({ entries: { http: "src/http.ts", contract: "src/contract.ts" } })',
      'createViteConfig({\n  entries: {\n    contract: "src/contract.ts",\n  },\n})',
    ]) {
      expect(contractSource(withContract, config), config).toEqual({
        kind: "source",
        path: "src/contract.ts",
      })
    }
  })

  it("does not pass what it cannot trace", () => {
    for (const config of [
      null,
      "createViteConfig({ packageName: 'x' })",
      'createViteConfig({ entries: { http: "src/http.ts" } })',
      "createViteConfig({ entries: ENTRIES })",
      'createViteConfig({ entries: { subcontract: "src/c.ts" } })',
    ]) {
      expect(contractSource(withContract, config).kind, String(config)).toBe(
        "unresolved"
      )
    }
  })
})

describe("checkContract", () => {
  const manifest = JSON.stringify({ exports: { "./contract": {} } })
  const config =
    'createViteConfig({ entries: { contract: "src/contract.ts" } })'

  it("walks the contract a workspace exports", () => {
    const files = {
      "/ws/package.json": manifest,
      "/ws/vite.config.ts": config,
      "/ws/src/contract.ts": 'import { x } from "react"',
    }
    const checked = checkContract("/ws", disk(files))
    expect(checked.exported).toBe(true)
    expect(checked.problems).toHaveLength(1)
    expect(checked.problems[0]).toContain("/ws/src/contract.ts:1:")
  })

  it("is quiet for a workspace with no contract, or no manifest", () => {
    expect(checkContract("/ws", disk({ "/ws/package.json": "{}" }))).toEqual({
      exported: false,
      problems: [],
    })
    expect(checkContract("/ws", disk({}))).toEqual({
      exported: false,
      problems: [],
    })
  })

  it("fails a contract whose source it cannot find", () => {
    const checked = checkContract("/ws", disk({ "/ws/package.json": manifest }))
    expect(checked.exported).toBe(true)
    expect(checked.problems).toEqual([
      expect.stringContaining("A2 cannot be checked"),
    ])
  })
})
