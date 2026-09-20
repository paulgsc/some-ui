/**
 * Layer 3 of the browser-unresponsive guard: a diff-level ban on the
 * traversal shapes whose cost the visited page decides.
 *
 * Read `tests/budgets/README.md` first for what this directory is blocking
 * and why a failure here is a release blocker rather than a tuning note.
 *
 * This is the counterpart to stylelint's role for hand-written CSS — it
 * fails on the *shape* in the source, without needing a test to exercise
 * the path. `tests/budgets/traversal-source-scan.ts` holds the parser and
 * documents what each shape costs and where the scan's limits are.
 *
 * Both cases below fail today. They are not aspirational: the walks they
 * name are the ones `classifier-traversal-budget.test.ts` measures at
 * ~1.5M computed-style reads per reconcile round on a GitHub "Files
 * changed" page.
 *
 * ── the intended remediation ─────────────────────────────────────────────
 *
 * Neither case asks for the traversal to be deleted — the extension has to
 * look at the page to theme it. Both ask for the traversal to be *bounded
 * and resumable*: a walk that visits at most N elements per task, records
 * where it stopped, and continues on the next idle callback. Once such a
 * helper exists, add its module to `BUDGETED_TRAVERSAL_MODULES` below and
 * route the existing call sites through it. Do not add a call site to that
 * list to make this pass — the list is for the implementation of the
 * budget, not for its exceptions.
 */

import { readdirSync, statSync } from "fs"
import { join, relative, sep } from "path"
import {
  renderFindings,
  scanSources,
  type SourceScan,
} from "@some-extension/common/budgets"
import { describe, expect, it } from "vitest"

const PACKAGE_ROOT = join(import.meta.dirname, "..", "..")

/**
 * Modules permitted to construct a raw `TreeWalker`, because they are where
 * the budget itself is implemented. Empty today — no such module exists yet,
 * which is the point.
 */
const BUDGETED_TRAVERSAL_MODULES: ReadonlyArray<string> = []

/** Every `.ts` file under `src/`, excluding this package's own test and typecheck-only trees. */
function productionSources(): ReadonlyArray<string> {
  const roots = [join(PACKAGE_ROOT, "src")]
  const out: Array<string> = []

  while (roots.length > 0) {
    const dir = roots.pop()
    if (dir === undefined) break
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        if (entry === "__tests__" || entry === "__typechecks__") continue
        roots.push(full)
        continue
      }
      if (!entry.endsWith(".ts") || entry.endsWith(".d.ts")) continue
      out.push(relative(PACKAGE_ROOT, full))
    }
  }

  return out.sort()
}

const sources = productionSources()
const scan: SourceScan = scanSources(PACKAGE_ROOT, sources)

const isBudgeted = (file: string): boolean =>
  BUDGETED_TRAVERSAL_MODULES.includes(file.split(sep).join("/"))

describe("traversal source budget", () => {
  it("scanned a plausible number of source files", () => {
    // A scan that silently globbed nothing would make every case below pass.
    expect(scan.filesScanned).toBeGreaterThan(20)
    expect(sources).toContain(join("src", "adapter", "pipeline.ts"))
  })

  it("constructs no TreeWalker outside a budgeted traversal module", () => {
    const violations = scan.treeWalks.filter((f) => !isBudgeted(f.file))

    expect(
      violations,
      `\n${violations.length} unbudgeted whole-subtree walk(s):\n\n` +
        `${renderFindings(violations)}\n\n` +
        `A TreeWalker pumped to exhaustion visits every element under its root ` +
        `in one uninterruptible task, and takes no argument that bounds it. ` +
        `Each of these runs over document.body on a page this extension does ` +
        `not control the size of.\n`
    ).toEqual([])
  })

  it("reads no computed style inside a traversal loop", () => {
    const violations = scan.styleReadsInWalkLoops

    expect(
      violations,
      `\n${violations.length} computed-style read(s) inside a traversal loop:\n\n` +
        `${renderFindings(violations)}\n\n` +
        `Each of these issues one getComputedStyle per element visited, so the ` +
        `page's size or depth decides how many the main thread performs in one ` +
        `task. The ancestor-chain form is the expensive one: it is O(depth) per ` +
        `element and O(elements x depth) per pass, which is why the contrast ` +
        `channel measures ~11 reads per element rather than ~1.\n`
    ).toEqual([])
  })

  it("holds the premise the loop rule rests on: every while loop here is a traversal", () => {
    // The rule above bans style reads in `while` loops specifically, on the
    // grounds that every `while` in this package walks a tree (a TreeWalker
    // pump, or a `cur = cur.parentElement` ancestor chain). If that ever
    // stops being true — someone writes a `while` over a bounded queue —
    // the rule starts producing false alarms, and this case is where that
    // gets noticed rather than worked around with an inline disable.
    //
    // Checked structurally: a traversal `while` is one whose body reassigns
    // its condition variable from a DOM accessor. Rather than re-implement
    // that analysis, this asserts the weaker, stable property that the loop
    // count stays small and reviewable, and names them all on failure.
    expect(
      scan.whileLoops.length,
      `\n${scan.whileLoops.length} while/do-while loops in src/. This rule's ` +
        `premise is that each one is a DOM traversal — re-read them and ` +
        `confirm before raising this number:\n\n` +
        `${renderFindings(scan.whileLoops)}\n`
    ).toBeLessThanOrEqual(8)
  })
})
