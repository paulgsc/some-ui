/**
 * Where `apps/www/src` makes network requests (docs/learner-data-authority.md,
 * LA1 and LA4), pinned by reading the source: no browser, no build.
 *
 * Two facts are easy to lose and invisible when lost:
 *
 * - **LA4: a corpus read carries no credentials.** Every `createDataSource`
 *   call passes `PUBLIC_READ`. A new data source that forgets it sends the
 *   account's session cookie with a lesson request, and the operator can tell
 *   a learner who chose the device from an account holder. Nothing fails.
 * - **LA1: nothing but the choke points names a network global.** The lint rule
 *   in `apps/www/eslint.config.js` restricts `fetch`, `XMLHttpRequest`,
 *   `WebSocket`, `EventSource` and `navigator.sendBeacon`. A lint rule is turned
 *   off by an `eslint-disable`, so this also pins the files that carry one
 *   for those rules, and the exemption list in the config itself.
 *
 * The checks are pure functions returning problems, and the last group feeds
 * them known-bad sources, so a test that has quietly stopped looking at
 * anything cannot stay green.
 */

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { describe, expect, it } from "vitest"

/** apps/www/src/lib/serving-privacy/__tests__ -> apps/www/src. */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")

/** Files that are the choke point, or stub the network on purpose. */
const NETWORK_EXEMPT = new Set([
  "lib/file-host-config/client.ts",
  "lib/device-backend/interceptor/index.ts",
])

function isTestFile(path: string): boolean {
  return (
    /(^|\/)__tests__\//.test(path) ||
    /\.test\.[cm]?tsx?$/.test(path) ||
    path.startsWith("test-support/")
  )
}

function sourceFiles(dir = SRC): Array<string> {
  const out: Array<string> = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(full))
    else if (/\.[cm]?tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts"))
      out.push(relative(SRC, full))
  }
  return out
}

function parse(path: string, text: string): ts.SourceFile {
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
}

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node)
  ts.forEachChild(node, (child) => walk(child, visit))
}

/** Every `createDataSource(...)` call in `text` whose text lacks `PUBLIC_READ`. */
function dataSourcesWithoutPublicRead(
  path: string,
  text: string
): Array<string> {
  const problems: Array<string> = []
  const file = parse(path, text)
  walk(file, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "createDataSource" &&
      !node.getText(file).includes("PUBLIC_READ")
    ) {
      const { line } = file.getLineAndCharacterOfPosition(node.getStart(file))
      problems.push(
        `${path}:${String(line + 1)} createDataSource without PUBLIC_READ (LA4)`
      )
    }
  })
  return problems
}

const NETWORK_GLOBALS = new Set([
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
])

/** Every `eslint-disable` naming a restricted-network rule, with its line. */
function networkLintDisables(path: string, text: string): Array<string> {
  const problems: Array<string> = []
  text.split("\n").forEach((line, i) => {
    if (
      /eslint-disable/.test(line) &&
      /no-restricted-(globals|properties)/.test(line)
    ) {
      problems.push(
        `${path}:${String(i + 1)} disables the network-global lint rule (LA1)`
      )
    }
  })
  return problems
}

/** Identifiers read as a network global in a file that is not a choke point. */
function networkGlobalUses(path: string, text: string): Array<string> {
  const problems: Array<string> = []
  const file = parse(path, text)
  walk(file, (node) => {
    const isCallee =
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      NETWORK_GLOBALS.has(node.expression.text)
    const isConstruct =
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      NETWORK_GLOBALS.has(node.expression.text)
    if (isCallee || isConstruct) {
      const { line } = file.getLineAndCharacterOfPosition(node.getStart(file))
      problems.push(
        `${path}:${String(line + 1)} uses a network global outside a choke point (LA1)`
      )
    }
  })
  return problems
}

describe("LA4: a corpus read carries no credentials", () => {
  it("passes PUBLIC_READ in every createDataSource call", () => {
    const problems = sourceFiles()
      .filter((f) => !isTestFile(f))
      .flatMap((f) =>
        dataSourcesWithoutPublicRead(f, readFileSync(join(SRC, f), "utf8"))
      )
    expect(problems).toEqual([])
  })

  it("still finds the data sources it is meant to guard", () => {
    const found = sourceFiles()
      .filter((f) => !isTestFile(f))
      .filter((f) =>
        /createDataSource\s*[<(]/.test(readFileSync(join(SRC, f), "utf8"))
      )
    expect(found.sort()).toEqual([
      "lib/hangul-vocab/index.ts",
      "lib/leetype-content/index.ts",
      "lib/topik-content/index.ts",
    ])
  })
})

describe("LA1: only the choke points name a network global", () => {
  it("has no fetch, XMLHttpRequest, WebSocket or EventSource call outside them", () => {
    const problems = sourceFiles()
      .filter((f) => !isTestFile(f) && !NETWORK_EXEMPT.has(f))
      .flatMap((f) => networkGlobalUses(f, readFileSync(join(SRC, f), "utf8")))
    expect(problems).toEqual([])
  })

  it("has no eslint-disable for the network-global rules", () => {
    const problems = sourceFiles()
      .filter((f) => !isTestFile(f))
      .flatMap((f) =>
        networkLintDisables(f, readFileSync(join(SRC, f), "utf8"))
      )
    expect(problems).toEqual([])
  })

  it("keeps the exemption list in eslint.config.js to the same two files", () => {
    const config = readFileSync(join(SRC, "../eslint.config.js"), "utf8")
    const listed = [...config.matchAll(/"(src\/lib\/[^"]+\.ts)"/g)].map(
      (m) => m[1]
    )
    expect(listed.sort()).toEqual(
      [...NETWORK_EXEMPT].map((f) => `src/${f}`).sort()
    )
  })
})

describe("the checks themselves", () => {
  it("flags a data source with no PUBLIC_READ, in any call shape", () => {
    expect(
      dataSourcesWithoutPublicRead(
        "x.ts",
        'const a = createDataSource<string, unknown>(url, { mode: "static" })'
      )
    ).toHaveLength(1)
    expect(
      dataSourcesWithoutPublicRead(
        "x.ts",
        "const a = createDataSource(url, { fetchOptions: { ...PUBLIC_READ } })"
      )
    ).toEqual([])
  })

  it("flags a bare network global call and a construct, not a type or a string", () => {
    expect(
      networkGlobalUses(
        "x.ts",
        'void fetch("/a"); new WebSocket("ws://b"); new EventSource("/c")'
      )
    ).toHaveLength(3)
    expect(
      networkGlobalUses(
        "x.ts",
        'type F = typeof fetch; const s = "fetch("; // fetch("/x")'
      )
    ).toEqual([])
  })

  it("flags an eslint-disable of the rule and nothing else", () => {
    expect(
      networkLintDisables(
        "x.ts",
        "// eslint-disable-next-line no-restricted-globals\nfetch(x)"
      )
    ).toHaveLength(1)
    expect(
      networkLintDisables("x.ts", "// eslint-disable-next-line no-console")
    ).toEqual([])
  })
})
