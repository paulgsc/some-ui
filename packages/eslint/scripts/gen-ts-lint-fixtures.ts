/**
 *
 * Generates real .ts/.js files on disk under
 * packages/eslint/tests/lint-fixtures/generated/
 *
 * WHY THIS EXISTS:
 *   typescript.config.ts uses `projectService: true`, which spins up the
 *   TypeScript language service. The language service resolves files through
 *   tsconfig.json — it cannot type-check virtual in-memory snippets that
 *   ESLint's lintText() passes as a fake filePath.  Depending on ESLint
 *   version and TS-ESLint version the failure mode is either a thrown
 *   exception ("file not found in project") or silently degraded type info
 *   (all type-aware rules become no-ops).
 *
 *   The fix: every snippet that typescript.lint.test.ts needs to lint lives
 *   as a real file on disk, covered by a tsconfig.json that projectService
 *   can discover.  Tests call lintFiles() on these real paths instead of
 *   lintText() with a virtual path.
 *
 * HOW TO RUN:
 *   pnpm --filter maishatu-eslint-kit gen:fixtures
 *
 * WHEN TO RE-RUN:
 *   Any time you add or modify a test snippet in typescript.lint.test.ts.
 *   The generated files are committed to the repo so CI does not need to
 *   run this script — but running it is idempotent and safe.
 *
 * STRUCTURE:
 *   Each test case gets its own file so ESLint's rule engine sees exactly
 *   one violation (or zero) in isolation.  File names are descriptive so
 *   failures in CI point to the right case without reading the file.
 *
 *   tests/lint-fixtures/generated/
 *   ├── tsconfig.json          ← projectService anchor
 *   ├── explicit-return-type/
 *   │   ├── missing.ts         ← should fire
 *   │   ├── present.ts         ← should not fire
 *   │   ├── js-file.js         ← JS override: should not fire
 *   │   └── rollup.config.ts   ← rollup override: should not fire
 *   ├── no-explicit-any/
 *   │   ├── using-any.ts
 *   │   └── using-unknown.ts
 *   ├── consistent-type-imports/
 *   │   ├── value-style.ts
 *   │   └── type-style.ts
 *   ├── consistent-type-definitions/
 *   │   ├── interface.ts
 *   │   └── type-alias.ts
 *   ├── consistent-type-assertions/
 *   │   ├── object-literal-as.ts ← should fire (assertionStyle: "never")
 *   │   ├── non-object-as.ts     ← should fire (assertionStyle: "never")
 *   │   ├── angle-bracket.ts     ← should fire (assertionStyle: "never")
 *   │   └── valid-type-guard.ts  ← should not fire (approved narrowing alternative)
 *   ├── array-type/
 *   │   ├── shorthand.ts
 *   │   └── generic.ts
 *   ├── no-useless-constructor/
 *   │   ├── empty-ctor.ts
 *   │   └── meaningful-ctor.ts
 *   ├── no-restricted-syntax/
 *   │   ├── indexed-access.ts
 *   │   └── dot-access.ts
 *   └── no-unused-vars/
 *       ├── unused-var.ts
 *       ├── used-var.ts
 *       ├── underscore-var.ts
 *       └── js-file.js
 */

import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = fileURLToPath(import.meta.url)
// scripts/ → packages/eslint/
const PKG_ROOT = join(dirname(HERE), "..")
const GEN = join(PKG_ROOT, "tests", "lint-fixtures", "generated")

// ── Helpers ───────────────────────────────────────────────────────────────

type FixtureFile = { path: string; content: string }

function file(relativePath: string, content: string): FixtureFile {
  return { path: join(GEN, relativePath), content: content.trimStart() }
}

async function write(fixtures: Array<FixtureFile>): Promise<void> {
  for (const { path, content } of fixtures) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content, "utf-8")
  }
  console.log(`✔  Wrote ${fixtures.length} fixture files to:`)
  console.log(`   ${GEN}`)
}

// ── tsconfig anchor ───────────────────────────────────────────────────────
//
// projectService discovers tsconfig.json by walking up from each linted file.
// We place one here so the language service can anchor to it and type-check
// the generated fixtures without pulling in the whole monorepo.

const tsconfig: FixtureFile = file(
  "tsconfig.json",
  JSON.stringify(
    {
      compilerOptions: {
        strict: true,
        target: "ES2020",
        module: "ESNext",
        moduleResolution: "bundler",
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        noEmit: true,
      },
      include: ["./**/*.ts"],
      exclude: ["node_modules"],
    },
    null,
    2
  ) + "\n"
)

// ── explicit-function-return-type ─────────────────────────────────────────

const explicitReturnType: Array<FixtureFile> = [
  file(
    "explicit-return-type/missing.ts",
    `// fixture: explicit-function-return-type should FIRE (missing return type)
export function greet(name: string) { return "hello " + name }
`
  ),
  file(
    "explicit-return-type/present.ts",
    `// fixture: explicit-function-return-type should NOT fire (return type present)
export function greet(name: string): string { return "hello " + name }
`
  ),
  // JS file — not a TS file, so we put it outside the tsconfig include
  // but inside the generated dir so the path helper can find it.
  file(
    "explicit-return-type/js-file.js",
    `// fixture: explicit-function-return-type should NOT fire for .js (JS override)
export function greet(name) { return "hello " + name }
`
  ),
  file(
    "explicit-return-type/rollup.config.ts",
    `// fixture: explicit-function-return-type should NOT fire (rollup override)
export function build() { return {} }
`
  ),
]

// ── no-explicit-any ───────────────────────────────────────────────────────

const noExplicitAny: Array<FixtureFile> = [
  file(
    "no-explicit-any/using-any.ts",
    `// fixture: no-explicit-any should FIRE
export function process(data: any): void { void data }
`
  ),
  file(
    "no-explicit-any/using-unknown.ts",
    `// fixture: no-explicit-any should NOT fire
export function process(data: unknown): void { void data }
`
  ),
]

// ── consistent-type-imports ───────────────────────────────────────────────

const consistentTypeImports: Array<FixtureFile> = [
  file(
    "consistent-type-imports/value-style.ts",
    `// fixture: consistent-type-imports should FIRE (missing "type" keyword)
import { Linter } from "eslint"
export type Bar = Linter.Config
`
  ),
  file(
    "consistent-type-imports/type-style.ts",
    `// fixture: consistent-type-imports should NOT fire
import type { Linter } from "eslint"
export type Bar = Linter.Config
`
  ),
]

// ── consistent-type-definitions ───────────────────────────────────────────

const consistentTypeDefinitions: Array<FixtureFile> = [
  file(
    "consistent-type-definitions/interface.ts",
    `// fixture: consistent-type-definitions should FIRE (interface instead of type)
export interface Foo { bar: string }
`
  ),
  file(
    "consistent-type-definitions/type-alias.ts",
    `// fixture: consistent-type-definitions should NOT fire
export type Foo = { bar: string }
`
  ),
]

// ── consistent-type-assertions ────────────────────────────────────────────
//
// Config: assertionStyle: "never"
//
// All variants of Type Assertions are fully banned across the codebase to protect
// runtime safety. Checking both 'as' styles and angle brackets must produce errors.
// Structural validation or type guards must be used instead.

const consistentTypeAssertions: Array<FixtureFile> = [
  file(
    "consistent-type-assertions/object-literal-as.ts",
    `// fixture: consistent-type-assertions should FIRE
// assertionStyle: "never" bans casting object literals completely
type Foo = { x: number }
export const foo = {} as Foo
`
  ),
  file(
    "consistent-type-assertions/non-object-as.ts",
    `// fixture: consistent-type-assertions should FIRE
// assertionStyle: "never" bans non-object inline assertions as well
export function narrow(x: unknown): string { return x as string }
`
  ),
  file(
    "consistent-type-assertions/angle-bracket.ts",
    `// fixture: consistent-type-assertions should FIRE
// assertionStyle: "never" bans angle-bracket cast wrappers
type Foo = { x: number }
const raw: unknown = {}
export const foo = <Foo>raw
`
  ),
  file(
    "consistent-type-assertions/valid-type-guard.ts",
    `// fixture: consistent-type-assertions should NOT fire
// Safe type guards are the design-approved alternative pattern to assertions
type User = { id: string }
export function isUser(x: unknown): x is User {
  return typeof x === "object" && x !== null && "id" in x
}
`
  ),
]

// ── array-type ────────────────────────────────────────────────────────────

const arrayType: Array<FixtureFile> = [
  file(
    "array-type/shorthand.ts",
    `// fixture: array-type should FIRE (T[] instead of Array<T>)
export function ids(): number[] { return [] }
`
  ),
  file(
    "array-type/generic.ts",
    `// fixture: array-type should NOT fire
export function ids(): Array<number> { return [] }
`
  ),
]

// ── no-useless-constructor ────────────────────────────────────────────────

const noUselessConstructor: Array<FixtureFile> = [
  file(
    "no-useless-constructor/empty-ctor.ts",
    `// fixture: no-useless-constructor should FIRE
export class Foo { constructor() {} }
`
  ),
  file(
    "no-useless-constructor/meaningful-ctor.ts",
    `// fixture: no-useless-constructor should NOT fire
export class Foo { private x: number; constructor(x: number) { this.x = x } }
`
  ),
]

// ── no-restricted-syntax (indexed access guard) ───────────────────────────

const noRestrictedSyntax: Array<FixtureFile> = [
  file(
    "no-restricted-syntax/indexed-access.ts",
    `// fixture: no-restricted-syntax should FIRE (computed member access)
const arr = [1, 2, 3]
export const x = arr[0]
`
  ),
  file(
    "no-restricted-syntax/dot-access.ts",
    `// fixture: no-restricted-syntax should NOT fire (dot access)
const obj = { x: 1 }
export const x = obj.x
`
  ),
]

// ── no-unused-vars ────────────────────────────────────────────────────────

const noUnusedVars: Array<FixtureFile> = [
  file(
    "no-unused-vars/unused-var.ts",
    `// fixture: no-unused-vars should FIRE (@typescript-eslint version)
const unused = 42
export const x = 1
`
  ),
  file(
    "no-unused-vars/used-var.ts",
    `// fixture: no-unused-vars should NOT fire
const value = 42
export const x = value
`
  ),
  file(
    "no-unused-vars/underscore-var.ts",
    `// fixture: no-unused-vars should NOT fire (_-prefixed ignored)
const _ignored = 42
export const x = 1
`
  ),
  file(
    "no-unused-vars/js-file.js",
    `// fixture: no @typescript-eslint rules should fire on .js
async function x() { Promise.resolve(1) }
export { x }
`
  ),
]

// ── Main ──────────────────────────────────────────────────────────────────

const ALL_FIXTURES: Array<FixtureFile> = [
  tsconfig,
  ...explicitReturnType,
  ...noExplicitAny,
  ...consistentTypeImports,
  ...consistentTypeDefinitions,
  ...consistentTypeAssertions,
  ...arrayType,
  ...noUselessConstructor,
  ...noRestrictedSyntax,
  ...noUnusedVars,
]

await write(ALL_FIXTURES)
