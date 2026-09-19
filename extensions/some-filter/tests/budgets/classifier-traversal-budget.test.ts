/**
 * Layer 4 of the browser-unresponsive guard: runtime budgets on the auto
 * classifier's own traversal, measured rather than inferred.
 *
 * Read `tests/budgets/README.md` first for what this directory is blocking
 * and why a failure here is a release blocker rather than a tuning note.
 *
 * ── the failure this exists to pin ───────────────────────────────────────
 *
 * The CSS budget suite next door (`enforcement-css-budget.test.ts`) covers
 * the declarative half. This covers the imperative one, which on a dense
 * page is the larger cost by an order of magnitude and is invisible to any
 * CSS linter.
 *
 * Every reconcile round runs two independent whole-document tree walks:
 * `pipeline.ts`'s `scan()` (the surface channel) and
 * `legibility-audit.ts`'s `auditLegibility()` (the contrast channel, via
 * `runContrastChannel`). Neither takes a node budget, a deadline, or a
 * chunk size. Both run to completion synchronously on the main thread, and
 * both call `getComputedStyle` per visited element — the contrast channel
 * more than once per element, because `resolveEffectiveBackdrop` walks
 * ancestors looking for an opaque backdrop.
 *
 * On an ordinary page that is fine and nobody notices. On GitHub's "Files
 * changed" view it is not a slow frame, it is a hung tab: the walk is
 * `O(files x lines)`, it holds the whole result in memory (every matched
 * element is pushed into a `Map<Key, Array<Element>>` that outlives the
 * round), and `RECONCILE_POLICY`'s 50ms debounce coalesces mutation bursts
 * into rounds without ever bounding what one round costs. A diff view that
 * streams files in as you scroll therefore re-pays the whole cost per
 * burst — each round eagerly re-walking everything already walked.
 *
 * ── what each budget asserts, and why that number ────────────────────────
 *
 * The budgets below are stated per *synchronous pass*, not per page, because
 * the defect is not "this work is expensive" — some of it is genuinely
 * needed — it is "this work is unbounded and uninterruptible". A bounded,
 * resumable traversal doing the same total work across many tasks would
 * satisfy every case here.
 *
 * `MAX_NODES_PER_TASK` is derived from the 50ms long-task threshold: past
 * that, a task is long enough that input handling visibly stalls. The per
 * element work here is not one cheap read — it is one to eleven
 * `getComputedStyle` calls, each of which can force style resolution — so a
 * couple of thousand elements is a generous rather than a strict reading of
 * that threshold.
 *
 * `SUBLINEAR_GROWTH_FACTOR` is the one case that does not depend on a
 * calibrated constant at all, and is the most important of the six: it
 * doubles the document and asserts the pass does not double its work. That
 * is the difference between a cost this extension controls and a cost the
 * visited page controls. It fails today at exactly 2.0x.
 */

import { auditLegibility } from "@filter/adapter/legibility-audit"
import { scan } from "@filter/adapter/pipeline"
import { beforeEach, describe, expect, it } from "vitest"

import {
  buildFilesChangedDocument,
  measure,
  projectToRealPage,
  retainedElements,
  type DocumentShape,
} from "./dense-document"

/**
 * The most elements one synchronous traversal may visit before it has to
 * yield. See this file's header for the 50ms-long-task derivation.
 */
export const MAX_NODES_PER_TASK = 2_000

/** The most `getComputedStyle` calls one synchronous pass may issue. */
export const MAX_STYLE_READS_PER_PASS = 4_000

/**
 * The most `Element` references a single pass's result may hold alive.
 * A scan result that retains one entry per matched element keeps the entire
 * rendered document reachable for as long as the session holds `lastScan` —
 * which, in `createContentSession`, is until the next round replaces it.
 */
export const MAX_RETAINED_ELEMENTS = 1_000

/**
 * Doubling the document must not double the work. 1.5x leaves room for a
 * bounded pass whose constant overhead does not scale perfectly, while still
 * failing anything genuinely linear in document size.
 */
export const SUBLINEAR_GROWTH_FACTOR = 1.5

/** ~3,800 elements — around 3% of the real page this models. */
const DENSE: DocumentShape = { files: 60, linesPerFile: 20 }
/** Half of `DENSE`, for the scaling case. */
const HALF_DENSE: DocumentShape = { files: 30, linesPerFile: 20 }

describe("auto classifier — surface channel (pipeline.ts scan)", () => {
  let nodes = 0

  // `beforeEach`, not `beforeAll`: vitest.setup.ts registers a global
  // `beforeEach` that clears `document.body.innerHTML`, and a global hook
  // runs before a file-local one. A fixture built in `beforeAll` is
  // therefore wiped before the first test body ever sees it — and every
  // budget below then passes against an empty document, measuring nothing.
  beforeEach(() => {
    nodes = buildFilesChangedDocument(DENSE)
  })

  it(`visits at most ${MAX_NODES_PER_TASK} elements in one synchronous pass`, () => {
    const { metrics } = measure(() => scan(document.body))

    expect(
      metrics.visits,
      `scan() visited ${metrics.visits} of ${nodes} elements in a single ` +
        `uninterruptible task — ${projectToRealPage(metrics.visits, nodes)}. ` +
        `It takes no node budget and no deadline, so the page decides how long ` +
        `the main thread is blocked, not this extension.`
    ).toBeLessThanOrEqual(MAX_NODES_PER_TASK)
  })

  it(`issues at most ${MAX_STYLE_READS_PER_PASS} computed-style reads in one synchronous pass`, () => {
    const { metrics } = measure(() => scan(document.body))

    expect(
      metrics.styleReads,
      `scan() issued ${metrics.styleReads} getComputedStyle calls over ${nodes} ` +
        `elements — ${projectToRealPage(metrics.styleReads, nodes)}. ` +
        `readAttr() reads the element's own style and ownTextColor() reads its ` +
        `parent's, so the rate is above one per element.`
    ).toBeLessThanOrEqual(MAX_STYLE_READS_PER_PASS)
  })

  it(`retains at most ${MAX_RETAINED_ELEMENTS} element references in its result`, () => {
    const { result, metrics } = measure(() => scan(document.body))
    const retained = retainedElements(result.elementsByKey)

    expect(
      retained,
      `scan() returned a result holding ${retained} Element references across ` +
        `${result.elementsByKey.size} keys — ${projectToRealPage(retained, metrics.nodes)}. ` +
        `createContentSession keeps this as \`lastScan\` until the next round, so ` +
        `the whole rendered document stays reachable between rounds. The keys are ` +
        `what decide() needs; the per-element arrays exist only so realize() can ` +
        `tag elements, and could be re-derived per key instead of retained.`
    ).toBeLessThanOrEqual(MAX_RETAINED_ELEMENTS)
  })

  it("does not scale with document size", () => {
    buildFilesChangedDocument(HALF_DENSE)
    const small = measure(() => scan(document.body))

    buildFilesChangedDocument(DENSE)
    const large = measure(() => scan(document.body))

    const sizeRatio = large.metrics.nodes / small.metrics.nodes
    const workRatio = large.metrics.styleReads / small.metrics.styleReads

    expect(
      workRatio,
      `Doubling the document (${small.metrics.nodes} -> ${large.metrics.nodes} ` +
        `elements, ${sizeRatio.toFixed(2)}x) multiplied scan()'s computed-style ` +
        `reads by ${workRatio.toFixed(2)}x ` +
        `(${small.metrics.styleReads} -> ${large.metrics.styleReads}). The cost of ` +
        `a round is therefore set by whatever page the user opened, with no ceiling ` +
        `this extension controls. This is the case that does not depend on any ` +
        `calibrated budget: any bounded traversal passes it, and nothing linear can.`
    ).toBeLessThan(SUBLINEAR_GROWTH_FACTOR)
  })
})

describe("auto classifier — contrast channel (legibility-audit.ts auditLegibility)", () => {
  let nodes = 0

  // See the surface-channel block above for why this is `beforeEach`.
  beforeEach(() => {
    nodes = buildFilesChangedDocument(DENSE)
  })

  it(`visits at most ${MAX_NODES_PER_TASK} elements in one synchronous pass`, () => {
    const { metrics } = measure(() => auditLegibility(document.body))

    expect(
      metrics.visits,
      `auditLegibility() visited ${metrics.visits} of ${nodes} elements in a ` +
        `single uninterruptible task. This is the *second* full-tree walk of the ` +
        `same round — pipeline.ts's fire() runs runContrastChannel() right after ` +
        `scan() — so a round's real traversal cost is this plus the surface ` +
        `channel's, both unbounded.`
    ).toBeLessThanOrEqual(MAX_NODES_PER_TASK)
  })

  it(`issues at most ${MAX_STYLE_READS_PER_PASS} computed-style reads in one synchronous pass`, () => {
    const { metrics } = measure(() => auditLegibility(document.body))

    expect(
      metrics.styleReads,
      `auditLegibility() issued ${metrics.styleReads} getComputedStyle calls over ` +
        `${nodes} elements — ${projectToRealPage(metrics.styleReads, nodes)}. ` +
        `The rate is far above one per element because resolveEffectiveBackdrop() ` +
        `walks ancestors per element looking for an opaque backdrop, and a deep ` +
        `tree makes that walk long: cost is O(elements x depth), not O(elements). ` +
        `A diff row sits deep, and there are as many of them as the pull request ` +
        `has lines.`
    ).toBeLessThanOrEqual(MAX_STYLE_READS_PER_PASS)
  })

  it(`retains at most ${MAX_RETAINED_ELEMENTS} element references in its result`, () => {
    const { result, metrics } = measure(() => auditLegibility(document.body))
    const retained = retainedElements(result.elementsByKey)

    expect(
      retained,
      `auditLegibility() returned a result holding ${retained} Element references ` +
        `— ${projectToRealPage(retained, metrics.nodes)} — on top of whatever the ` +
        `surface channel is already holding for the same round.`
    ).toBeLessThanOrEqual(MAX_RETAINED_ELEMENTS)
  })
})

describe("auto classifier — a reconcile round as a whole", () => {
  it("does not walk the whole document more than once per round", () => {
    buildFilesChangedDocument(DENSE)

    // Exactly what pipeline.ts's cycle() -> fire() does for a themed round:
    // the surface channel, then the contrast channel, on the same tree, in
    // the same task.
    const { metrics } = measure(() => {
      scan(document.body)
      auditLegibility(document.body)
    })

    expect(
      metrics.walkers,
      `One round started ${metrics.walkers} full-tree walks over the same ` +
        `unchanged document, costing ${metrics.styleReads} computed-style reads ` +
        `in total (${projectToRealPage(metrics.styleReads, metrics.nodes)}). ` +
        `The two channels are kept independent by design — see pipeline.ts's ` +
        `runContrastChannel — but independence is about which evidence each ` +
        `channel may see, not about how many times the tree gets walked. One ` +
        `traversal can feed both.`
    ).toBeLessThanOrEqual(1)
  })
})
