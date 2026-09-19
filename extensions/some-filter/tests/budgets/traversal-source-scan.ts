/**
 * A syntactic scan of this extension's own source for the two traversal
 * shapes whose cost is set by the visited page rather than by this code.
 *
 * ── why a source scan and not only the runtime budgets ───────────────────
 *
 * `classifier-traversal-budget.test.ts` measures what the *currently
 * exercised* code paths cost. That is the stronger evidence, and it is also
 * the weaker guard: a new unbudgeted walk added next to the existing ones,
 * on a path no budget spec happens to call, would not move a single number
 * there. This scan is the diff-level counterpart — it fails on the shape,
 * wherever it appears, whether or not any test drives it.
 *
 * Parsed with the TypeScript compiler's own parser rather than matched with
 * regexes: `createTreeWalker` in a doc comment, in a string, or in a
 * disabled block is not a traversal, and three of the four occurrences in
 * this package today are in prose.
 *
 * ── the two shapes, and what each one costs ──────────────────────────────
 *
 * **1. A whole-subtree walk with no budget.** `document.createTreeWalker`
 * pumped to exhaustion visits every element under its root in one
 * uninterruptible task. There is no argument this function takes that
 * bounds it; the bound has to be imposed by the caller, and no caller here
 * imposes one.
 *
 * **2. A computed-style read inside a `while` loop.** Every `while` loop in
 * this package's `src/` is a tree traversal — either a `TreeWalker`
 * `nextNode()` pump or an ancestor-chain walk (`cur = cur.parentElement`).
 * So a `getComputedStyle` inside one is, without exception here, a read
 * whose call count is decided by the document's size or depth. That is what
 * makes this a defensible syntactic rule in *this* codebase rather than a
 * generic one: it is checked by `everyWhileLoopIsATraversal` in the spec
 * that consumes this module, so the premise fails loudly if it ever stops
 * holding.
 *
 * Known limitation, deliberately not papered over: this is lexical. A style
 * read in a helper *called from* a walk loop is not reported here —
 * `pipeline.ts`'s `scan()` pumps a walker and calls `readAttr()`, whose
 * `getComputedStyle` lives one frame away and is invisible to this scan.
 * The runtime budgets catch that one; the two layers are complementary and
 * neither subsumes the other.
 */

import { readFileSync } from "fs"
import { join, relative } from "path"
import ts from "typescript"

export type SourceFinding = {
  /** Path relative to the package root. */
  readonly file: string
  /** 1-indexed line. */
  readonly line: number
  /** The offending source text, trimmed. */
  readonly text: string
}

function parse(absolutePath: string): ts.SourceFile {
  return ts.createSourceFile(
    absolutePath,
    readFileSync(absolutePath, "utf8"),
    ts.ScriptTarget.ES2020,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
}

function locate(
  source: ts.SourceFile,
  node: ts.Node,
  packageRoot: string
): SourceFinding {
  const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
  return {
    file: relative(packageRoot, source.fileName),
    line: line + 1,
    text: node.getText(source).split("\n")[0]?.trim() ?? "",
  }
}

/** The name a call expression invokes, whether `f()` or `o.f()`. */
function calleeName(node: ts.CallExpression): string | null {
  const callee = node.expression
  if (ts.isIdentifier(callee)) return callee.text
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text
  return null
}

function forEachNode(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node)
  node.forEachChild((child) => forEachNode(child, visit))
}

/** Whether `node` is lexically inside a `while` / `do…while` loop, without crossing a function boundary. */
function insideWhileLoop(node: ts.Node): boolean {
  // Walks up to the SourceFile rather than up to an undefined parent: the
  // compiler API types `Node.parent` as `ts.Node`, not `ts.Node | undefined`,
  // even though the root's parent is undefined at runtime. Testing for
  // undefined is therefore a condition the type system believes can never be
  // true, and the ascent has no statically visible terminator at all.
  let current = node.parent
  while (!ts.isSourceFile(current)) {
    if (ts.isWhileStatement(current) || ts.isDoStatement(current)) return true
    // A style read inside a callback declared in a loop body is charged to
    // the callback, not the loop — it may well be called elsewhere.
    if (ts.isFunctionLike(current)) return false
    current = current.parent
  }
  return false
}

export type SourceScan = {
  /** Shape 1: `createTreeWalker` call sites. */
  readonly treeWalks: ReadonlyArray<SourceFinding>
  /** Shape 2: `getComputedStyle` calls lexically inside a `while` / `do…while` loop. */
  readonly styleReadsInWalkLoops: ReadonlyArray<SourceFinding>
  /** Every `while` / `do…while` loop found, for the premise check in the consuming spec. */
  readonly whileLoops: ReadonlyArray<SourceFinding>
  /** Files actually parsed — guards against a scan that silently matched nothing. */
  readonly filesScanned: number
}

/**
 * Scans `files` (absolute paths) for both shapes.
 *
 * Test files are expected to be excluded by the caller: a test may legitimately
 * walk a fixture tree, and holding test code to a production traversal budget
 * would only teach people to disable the rule.
 */
export function scanSources(
  packageRoot: string,
  files: ReadonlyArray<string>
): SourceScan {
  const treeWalks: Array<SourceFinding> = []
  const styleReadsInWalkLoops: Array<SourceFinding> = []
  const whileLoops: Array<SourceFinding> = []

  for (const file of files) {
    const source = parse(join(packageRoot, file))

    forEachNode(source, (node) => {
      if (ts.isWhileStatement(node) || ts.isDoStatement(node)) {
        whileLoops.push(locate(source, node, packageRoot))
        return
      }

      if (!ts.isCallExpression(node)) return
      const name = calleeName(node)

      if (name === "createTreeWalker") {
        treeWalks.push(locate(source, node, packageRoot))
        return
      }

      if (name === "getComputedStyle" && insideWhileLoop(node)) {
        styleReadsInWalkLoops.push(locate(source, node, packageRoot))
      }
    })
  }

  return {
    treeWalks,
    styleReadsInWalkLoops,
    whileLoops,
    filesScanned: files.length,
  }
}

/** Renders findings as a `file:line` list for an assertion message. */
export function renderFindings(findings: ReadonlyArray<SourceFinding>): string {
  return findings
    .map((f) => `  ${f.file}:${f.line}\n           ↳ ${f.text}`)
    .join("\n")
}
