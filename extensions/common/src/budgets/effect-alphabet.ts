/**
 * The effect alphabet: the page-affecting browser primitives whose cost or
 * retention can depend on the visited page rather than on this repository.
 *
 * ── why an alphabet of primitives rather than a list of functions ────────
 *
 * The first version of this directory recognised *this extension's current
 * implementation*: `scan`, `auditLegibility`, `createTreeWalker` spelled
 * inside a `while` loop in a file under `src/`. That rejects the known-bad
 * head, but it is not a rule — a semantically identical unbounded traversal
 * written with `for…of` over `querySelectorAll`, in a new module, in an
 * imported workspace package, passes every one of those checks. A gate that
 * only recognises today's code cannot say anything about tomorrow's build.
 *
 * What generalises is not the function but the *effect*. Every way this
 * extension can make the browser do work proportional to the page bottoms
 * out in a small, enumerable set of host primitives. Those primitives are
 * property names on host objects, so they survive bundling and identifier
 * mangling verbatim — `getComputedStyle` is still `getComputedStyle` in
 * `dist/content.js`. That makes the *shipped artifact* scannable for them,
 * which is the only scope at which a closure claim means anything: the
 * bundle already contains every imported workspace package, every npm
 * dependency and every generated string that will actually run.
 *
 * ── what this alphabet does and does not establish ───────────────────────
 *
 * It establishes **closure**, conservatively: an effect that is not in this
 * alphabet, and any construct that could hide one (computed member access,
 * `eval`, `Function`), is reported as unclassified and fails the gate. It
 * does not establish that an admitted effect is cheap. The cost classes
 * below are *declarations* recorded in the ledger and enforced only as far
 * as the kernel enforcing them goes; `tests/budgets/README.md` states
 * exactly how far that is. Treating a declared bound as a proved bound is
 * the error this file exists to avoid making silently.
 */

/**
 * How an occurrence's cost scales, in the topology the relay names: `N`
 * tabs, `S_i` relevant nodes in tab `i`, `H_i` its depth, `A_i(t)` arrivals
 * over an interval.
 */
export type CostClass =
  /** Cost independent of S, H and A. Admitted. */
  | "constant"
  /**
   * Cost proportional to a caller-supplied budget that is itself
   * independent of S and H — a chunked, resumable pass. Admitted.
   */
  | "budgeted"
  /** Cost proportional to S_i or H_i within one dispatch. NOT admitted. */
  | "unbounded-per-dispatch"
  /**
   * Generates arrivals. Admitted only with a declared coalescing or
   * admission-control discipline, since it multiplies every other class.
   */
  | "arrival-source"

export const ADMITTED_COST_CLASSES: ReadonlySet<CostClass> = new Set<CostClass>(
  ["constant", "budgeted", "arrival-source"]
)

/** How much of the page an occurrence can keep reachable after its dispatch returns. */
export type RetentionClass =
  /** Retains nothing past the dispatch. Admitted. */
  | "none"
  /** Retains O(1), or O(distinct colors) — independent of S_i. Admitted. */
  | "bounded"
  /** Retains state proportional to S_i or Σ_i S_i. NOT admitted. */
  | "unbounded"

export const ADMITTED_RETENTION_CLASSES: ReadonlySet<RetentionClass> =
  new Set<RetentionClass>(["none", "bounded"])

export type EffectKind =
  /** Selects or walks a subtree; result size and cost scale with S_i. */
  | "traversal"
  /** Reads computed style or geometry; can force style/layout resolution. */
  | "style-read"
  /** Emits CSS into the page; cost is paid by the engine's matching and invalidation. */
  | "style-emit"
  /** Registers a callback source; multiplies every other effect by A_i(t). */
  | "arrival"
  /** Could resolve to any of the above at runtime; never admitted. */
  | "opaque"

/**
 * The alphabet. Keys are the exact identifier or property name as it
 * appears in source and survives into the bundle.
 *
 * Deliberately over-inclusive on the cheap side: `matches` and `closest`
 * are here even though a single call is modest, because they are
 * `O(H_i)` and the failure mode this directory exists for is precisely a
 * cheap-looking per-element call made once per element.
 */
export const EFFECT_ALPHABET: ReadonlyMap<string, EffectKind> = new Map<
  string,
  EffectKind
>([
  // ── traversal: cost and result size scale with S_i ─────────────────────
  ["createTreeWalker", "traversal"],
  ["createNodeIterator", "traversal"],
  ["querySelectorAll", "traversal"],
  ["querySelector", "traversal"],
  ["getElementsByTagName", "traversal"],
  ["getElementsByTagNameNS", "traversal"],
  ["getElementsByClassName", "traversal"],
  ["getElementsByName", "traversal"],
  ["elementsFromPoint", "traversal"],
  ["closest", "traversal"],
  ["matches", "traversal"],

  // ── style-read: can force style or layout resolution ───────────────────
  ["getComputedStyle", "style-read"],
  ["getBoundingClientRect", "style-read"],
  ["getClientRects", "style-read"],
  ["computedStyleMap", "style-read"],
  ["offsetHeight", "style-read"],
  ["offsetWidth", "style-read"],
  ["offsetTop", "style-read"],
  ["offsetLeft", "style-read"],
  ["scrollHeight", "style-read"],
  ["scrollWidth", "style-read"],
  ["clientHeight", "style-read"],
  ["clientWidth", "style-read"],

  // ── style-emit: the engine pays the matching and invalidation cost ─────
  ["insertRule", "style-emit"],
  ["addRule", "style-emit"],
  ["adoptedStyleSheets", "style-emit"],
  ["insertCSS", "style-emit"],
  ["removeCSS", "style-emit"],
  ["setProperty", "style-emit"],

  // ── arrival: multiplies every other effect by A_i(t) ───────────────────
  ["MutationObserver", "arrival"],
  ["ResizeObserver", "arrival"],
  ["IntersectionObserver", "arrival"],
  ["PerformanceObserver", "arrival"],
  ["addEventListener", "arrival"],
  ["setInterval", "arrival"],
  ["setTimeout", "arrival"],
  ["requestAnimationFrame", "arrival"],
  ["requestIdleCallback", "arrival"],
  ["queueMicrotask", "arrival"],

  // ── opaque: could be any of the above; never admitted ──────────────────
  ["eval", "opaque"],
  ["Function", "opaque"],
  ["executeScript", "opaque"],
  ["importScripts", "opaque"],
])

/*
 * There is deliberately no list of "host objects to watch for computed
 * access on" here. An earlier version had one — `window`, `document`, … —
 * and it was falsified by aliasing: after bundling, `const d = document;
 * d[name]` has a mangled local as its root, so no root-name list can see
 * it. `bundle-effect-scan.ts` counts *every* non-literal computed access
 * instead, and the ledger ratchets that count. See that file's own
 * `UNCLASSIFIED_DYNAMIC` comment for why counting is the honest claim.
 */
