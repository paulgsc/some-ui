/**
 * The dense-document fixture and traversal instrumentation shared by
 * `classifier-traversal-budget.test.ts`.
 *
 * ── what the fixture models ──────────────────────────────────────────────
 *
 * GitHub's pull-request "Files changed" view, which is the shape that
 * actually hangs: N changed files, each rendered as its own expanded
 * container, each containing M diff rows, each row a handful of elements
 * carrying explicit background and foreground colors (addition green,
 * deletion red, context white, line-number grey). Two properties of that
 * page matter and both are reproduced here:
 *
 *   - **It is deep and wide at the same time.** Element count is N x M, and
 *     both N and M are attacker-supplied in the sense that matters: they are
 *     whatever the pull request happens to contain, not anything this
 *     extension chose. A 60-file PR touching 400 lines a file is ordinary
 *     and lands somewhere north of 100,000 elements.
 *
 *   - **Every row carries real color evidence.** This is not incidental. A
 *     fixture of undecorated `<div>`s would let `readAttr` return `null` for
 *     every element (`color.ts`'s `parseColor` rejects a fully transparent
 *     background), the scan would retain nothing, and the retention budgets
 *     below would pass while measuring nothing at all. Diff rows on the real
 *     page do carry backgrounds, so the fixture does too.
 *
 * The sizes used here are ~30x smaller than that real page, deliberately:
 * jsdom resolves `getComputedStyle` far more slowly than a browser, and the
 * point is not to reproduce the hang in a unit test. It is that the traversal
 * is *already* over budget at a fraction of real-world density, and — via
 * `measure()` — that its cost grows in exact proportion to document size, so
 * the extrapolation to the real page is arithmetic rather than assertion.
 */

/** Elements per diff row in the fixture: the row itself plus a line-number and a content span. */
const ELEMENTS_PER_ROW = 3

export type DocumentShape = {
  /** Changed files — one expandable container each. */
  readonly files: number
  /** Diff rows per file. */
  readonly linesPerFile: number
}

/**
 * Replaces the document body with a "Files changed"-shaped tree and returns
 * the number of elements in the document.
 */
export function buildFilesChangedDocument(shape: DocumentShape): number {
  const files: Array<string> = []

  for (let f = 0; f < shape.files; f += 1) {
    const rows: Array<string> = []
    for (let l = 0; l < shape.linesPerFile; l += 1) {
      // Addition / deletion / context, in roughly the proportion a real diff
      // carries. The exact mix is irrelevant; that each row has *some*
      // explicit background is not — see this file's header.
      const background =
        l % 7 === 0 ? "#e6ffec" : l % 11 === 0 ? "#ffebe9" : "#ffffff"
      rows.push(
        `<div class="diff-line" style="background-color:${background}">` +
          `<span class="blob-num" style="color:#6e7781">${l}</span>` +
          `<span class="blob-code" style="color:#1f2328">const value_${l} = ${l};</span>` +
          `</div>`
      )
    }
    files.push(
      `<details open class="file" style="background-color:#ffffff">` +
        `<summary class="file-header" style="background-color:#f6f8fa;color:#1f2328">src/module_${f}.ts</summary>` +
        `<div class="diff-table" style="background-color:#ffffff">${rows.join("")}</div>` +
        `</details>`
    )
  }

  document.body.innerHTML = `<div id="files-bucket" style="background-color:#ffffff">${files.join("")}</div>`
  return document.querySelectorAll("*").length
}

/** The element count a shape produces, without building it — for message arithmetic. */
export function elementCount(shape: DocumentShape): number {
  // details + summary + diff-table wrapper, plus the rows.
  const perFile = 3 + shape.linesPerFile * ELEMENTS_PER_ROW
  return shape.files * perFile
}

export type TraversalMetrics = {
  /** Elements in the document at the time of the run. */
  readonly nodes: number
  /** `TreeWalker.nextNode()` calls — one per element the pass visited. */
  readonly visits: number
  /** `getComputedStyle()` calls. Each one can force the engine to resolve style for that element. */
  readonly styleReads: number
  /** `createTreeWalker()` constructions — one per full-tree walk started. */
  readonly walkers: number
}

/**
 * Runs `pass` with `getComputedStyle` and `createTreeWalker` instrumented,
 * and reports what it cost.
 *
 * Both globals are restored in a `finally`: a throw inside `pass` that left
 * a counting `getComputedStyle` installed would silently corrupt every
 * later test in the file.
 */
export function measure<T>(pass: () => T): {
  readonly result: T
  readonly metrics: TraversalMetrics
} {
  const nodes = document.querySelectorAll("*").length
  const realGetComputedStyle = window.getComputedStyle
  const realCreateTreeWalker = document.createTreeWalker

  let visits = 0
  let styleReads = 0
  let walkers = 0

  window.getComputedStyle = function countingGetComputedStyle(
    element: Element,
    pseudoElement?: string | null
  ): CSSStyleDeclaration {
    styleReads += 1
    return realGetComputedStyle.call(window, element, pseudoElement)
  }

  document.createTreeWalker = function countingCreateTreeWalker(
    root: Node,
    whatToShow?: number,
    filter?: NodeFilter | null
  ): TreeWalker {
    walkers += 1
    const walker = realCreateTreeWalker.call(document, root, whatToShow, filter)
    const realNextNode = walker.nextNode.bind(walker)
    walker.nextNode = (): Node | null => {
      visits += 1
      return realNextNode()
    }
    return walker
  }

  try {
    const result = pass()
    return { result, metrics: { nodes, visits, styleReads, walkers } }
  } finally {
    window.getComputedStyle = realGetComputedStyle
    document.createTreeWalker = realCreateTreeWalker
  }
}

/** Total `Element` references a scan result holds alive in its key→elements map. */
export function retainedElements(
  elementsByKey: ReadonlyMap<string, ReadonlyArray<Element>>
): number {
  let total = 0
  for (const elements of elementsByKey.values()) total += elements.length
  return total
}

/**
 * A representative real "Files changed" page, for projecting a measured
 * per-element rate onto the page that actually hangs. 60 changed files at
 * 400 lines each, ~5 elements a row — a normal-sized pull request, not a
 * pathological one.
 */
export const REAL_PAGE_ELEMENTS = 120_000

/** Projects a measured cost onto `REAL_PAGE_ELEMENTS`, for assertion messages. */
export function projectToRealPage(measured: number, nodes: number): string {
  const projected = Math.round((measured / nodes) * REAL_PAGE_ELEMENTS)
  return `${projected.toLocaleString("en-US")} (projected onto a ${REAL_PAGE_ELEMENTS.toLocaleString("en-US")}-element "Files changed" page, at the measured rate of ${(measured / nodes).toFixed(2)} per element)`
}
