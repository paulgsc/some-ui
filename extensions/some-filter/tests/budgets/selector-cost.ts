/**
 * A static cost model for a CSS selector, derived from how browser engines
 * actually match: **right to left**, starting from the *subject* (the
 * rightmost compound), against every element the subject can match.
 *
 * This module is the shared analyzer behind `enforcement-css-budget.test.ts`.
 * It exists as its own file — rather than inline in that spec — because the
 * budget it encodes is a claim about *this extension's whole injected CSS
 * surface*, not about one function's output: any future sheet builder
 * (a second swatch family, a Firefox-specific sheet, a shadow-scope
 * adopted sheet) is meant to be pointed at the same analyzer rather than
 * given its own hand-written regexes.
 *
 * ── why a cost model and not a regex ─────────────────────────────────────
 *
 * `enforcement-sheet.ts` builds its CSS by string concatenation from
 * TypeScript constants, so no CSS linter ever sees it — stylelint runs over
 * `**\/*.css` and this sheet is never a `.css` file. A regex over the built
 * text is the obvious substitute and is the wrong tool twice over: it
 * cannot tell a `*` that is the subject of a rule (tree-wide match) from a
 * `*` buried inside a `:not()` argument (a per-candidate ancestor check),
 * and it cannot tell `:where(div, section)` (constrained to two tags) from
 * `:where(:not(.x))` (constrained to nothing). Both distinctions are the
 * whole difference between a rule that costs O(1) per mutation and one that
 * costs O(document). So this parses.
 *
 * ── the three cost drivers this scores ───────────────────────────────────
 *
 * 1. **Subject breadth.** The subject compound decides how many elements
 *    the engine even considers. A universal subject means *every element in
 *    the document*, on every style recalculation, forever. This is the
 *    dominant term and it is scored as such.
 *
 * 2. **Per-candidate work.** Every `:not()` / `:is()` / `:where()` argument
 *    list is re-evaluated for each candidate the subject admits. Cheap
 *    individually, linear in count, multiplied by driver 1.
 *
 * 3. **Invalidation scope** — the one that actually hangs a page, and the
 *    one a "does this selector look complicated" heuristic misses entirely.
 *    A *sibling-count-dependent* pseudo-class (`:only-child`,
 *    `:nth-last-child`, …) makes an element's own match result depend on how
 *    many siblings it has, so inserting or removing a single child forces
 *    the engine to re-evaluate that element's entire sibling list. An
 *    argument containing a *combinator* (`:not([data-my-ext] *)`) makes the
 *    result depend on ancestors, so an attribute change high in the tree
 *    invalidates everything beneath it. On a page that streams DOM in — a
 *    diff view expanding files, an infinite feed — these turn one mutation
 *    into a tree-wide restyle.
 *
 * Constant-time structural pseudo-classes are deliberately NOT banned:
 * `:first-child` / `:last-child` / `:first-of-type` / `:last-of-type` are
 * answered by looking at one adjacent sibling and do not carry driver 3's
 * cost. Banning them alongside the counting ones would be easier to write
 * and would be wrong.
 */

import * as csstree from "@eslint/css-tree"

/**
 * Pseudo-classes whose truth value for one element depends on *how many*
 * siblings it has, rather than on a single adjacent one — see driver 3
 * above. These are the ones that turn a single child insertion into a
 * sibling-list-wide re-evaluation.
 */
const SIBLING_COUNTING_PSEUDOS: ReadonlySet<string> = new Set([
  "only-child",
  "only-of-type",
  "nth-child",
  "nth-of-type",
  "nth-last-child",
  "nth-last-of-type",
])

/** `:is()` / `:where()` — the two that can *constrain* a subject rather than merely filter it, which `hasQualifyingPart` below has to look through. */
const MATCHES_ANY_PSEUDOS: ReadonlySet<string> = new Set([
  "is",
  "where",
  "matches",
  "any",
])

/**
 * Pseudo-classes that *identify* an element rather than filter one — each
 * matches at most one element per tree, so a compound carrying one is as
 * constrained as an id selector, not universal. State pseudo-classes
 * (`:hover`, `:visited`, `:focus`, …) are deliberately absent: they admit
 * any element and constrain nothing.
 */
const CONSTRAINING_PSEUDOS: ReadonlySet<string> = new Set([
  "root",
  "host",
  "scope",
])

/** Every pseudo-class whose argument is a selector list this analyzer walks into. */
const SELECTOR_ARG_PSEUDOS: ReadonlySet<string> = new Set([
  ...MATCHES_ANY_PSEUDOS,
  "not",
  "has",
])

// ── scoring weights ─────────────────────────────────────────────────────────
//
// Calibrated so that a selector carrying any single driver-1 or driver-3
// hazard lands over MAX_SELECTOR_COST on its own, while the shipped
// `:where(<tags>)${EXT_GUARD}` idiom — three argument lists and one
// ancestor-dependent argument, applied to a tag-constrained subject — lands
// under it. See `enforcement-css-budget.test.ts`'s own EXT_GUARD ceiling
// case, which pins that headroom so it cannot be spent silently.

const UNIVERSAL_SUBJECT_COST = 40
const SIBLING_COUNTING_PSEUDO_COST = 25
const HAS_COST = 30
const SELECTOR_ARGUMENT_COST = 5
const COMBINATOR_IN_ARGUMENT_COST = 10

/** The per-selector ceiling. A selector at or under this is one whose match cost does not scale with document size. */
export const MAX_SELECTOR_COST = 30

export type SelectorCost = {
  /** The selector as the parser re-serializes it (normalized whitespace). */
  readonly selector: string
  /** The subject compound can match every element in the document — driver 1. */
  readonly universalSubject: boolean
  /** Sibling-counting pseudo-classes found anywhere in the selector — driver 3. */
  readonly siblingCountingPseudos: ReadonlyArray<string>
  /** `:has()` occurrences — driver 3's worst case (invalidates on any mutation within the argument's reach). */
  readonly hasCount: number
  /** `:not()`/`:is()`/`:where()`/`:has()` arguments containing a combinator — driver 3's ancestor-dependent form. */
  readonly combinatorArguments: ReadonlyArray<string>
  /** Total weighted cost. Compare against `MAX_SELECTOR_COST`. */
  readonly cost: number
}

function isSelectorList(node: csstree.CssNode): node is csstree.SelectorList {
  return node.type === "SelectorList"
}

/** The selector lists a `:not()`/`:is()`/`:where()`/`:has()` node carries as its argument. */
function argumentLists(
  pseudo: csstree.PseudoClassSelector
): ReadonlyArray<csstree.SelectorList> {
  const lists: Array<csstree.SelectorList> = []
  pseudo.children?.forEach((child) => {
    if (isSelectorList(child)) lists.push(child)
  })
  return lists
}

/**
 * Whether a compound selector carries something that constrains *which*
 * elements it can match — a tag, class, id, attribute, or an element-
 * identifying pseudo-class such as `:root` — as opposed to only filtering
 * an otherwise-unbounded candidate set.
 *
 * Looks *through* `:is()`/`:where()`: `:where(div, section)` is constrained
 * (every branch names a tag), but `:where(div, :not(.x))` is not (one branch
 * admits anything). `:not()` is deliberately not treated as constraining —
 * `:not(img)` still admits every non-image element in the document.
 */
function hasQualifyingPart(parts: ReadonlyArray<csstree.CssNode>): boolean {
  for (const part of parts) {
    if (part.type === "ClassSelector") return true
    if (part.type === "IdSelector") return true
    if (part.type === "AttributeSelector") return true
    if (part.type === "TypeSelector" && part.name !== "*") return true
    if (
      part.type === "PseudoClassSelector" &&
      CONSTRAINING_PSEUDOS.has(part.name.toLowerCase())
    ) {
      return true
    }
    if (
      part.type === "PseudoClassSelector" &&
      MATCHES_ANY_PSEUDOS.has(part.name.toLowerCase())
    ) {
      const lists = argumentLists(part)
      // Every branch must itself be constrained, otherwise the union is not.
      const branches: Array<Array<csstree.CssNode>> = []
      for (const list of lists) {
        list.children.forEach((branch) => {
          if (branch.type === "Selector") {
            branches.push([...branch.children.toArray()])
          }
        })
      }
      if (
        branches.length > 0 &&
        branches.every((branch) => hasQualifyingPart(branch))
      ) {
        return true
      }
    }
  }
  return false
}

/**
 * The subject compound: the run of parts after the last top-level
 * combinator. `a b` has subject `b`; `*:not(img)` has subject
 * `*:not(img)` (there is no combinator, so the whole selector is one
 * compound).
 */
function subjectCompound(
  selector: csstree.Selector
): ReadonlyArray<csstree.CssNode> {
  const parts = [...selector.children.toArray()]
  let start = 0
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]
    if (part?.type === "Combinator") start = i + 1
  }
  return parts.slice(start)
}

/**
 * `::selection`, `::placeholder`, `::before` — a rule whose subject carries a
 * pseudo-element does not match elements at all, so driver 1 does not apply
 * to it however universal its element half looks. `enforcement-sheet.ts`
 * makes exactly this argument for its own `::selection` rule; this is that
 * argument, mechanized.
 */
function carriesPseudoElement(parts: ReadonlyArray<csstree.CssNode>): boolean {
  for (const part of parts) {
    if (part.type === "PseudoElementSelector") return true
    if (
      part.type === "PseudoClassSelector" &&
      SELECTOR_ARG_PSEUDOS.has(part.name.toLowerCase())
    ) {
      for (const list of argumentLists(part)) {
        for (const branch of list.children.toArray()) {
          if (
            branch.type === "Selector" &&
            carriesPseudoElement([...branch.children.toArray()])
          ) {
            return true
          }
        }
      }
    }
  }
  return false
}

/** Analyzes one parsed `Selector` node against the cost model in this file's header. */
export function costOfSelector(selector: csstree.Selector): SelectorCost {
  const siblingCountingPseudos: Array<string> = []
  const combinatorArguments: Array<string> = []
  let hasCount = 0
  let argumentListCount = 0

  csstree.walk(selector, (node: csstree.CssNode) => {
    if (node.type !== "PseudoClassSelector") return
    const name = node.name.toLowerCase()

    if (SIBLING_COUNTING_PSEUDOS.has(name))
      siblingCountingPseudos.push(`:${name}`)
    if (name === "has") hasCount += 1

    if (!SELECTOR_ARG_PSEUDOS.has(name)) return

    for (const list of argumentLists(node)) {
      argumentListCount += 1
      for (const branch of list.children.toArray()) {
        if (branch.type !== "Selector") continue
        const hasCombinator = branch.children
          .toArray()
          .some((part) => part.type === "Combinator")
        if (hasCombinator) {
          combinatorArguments.push(`:${name}(${csstree.generate(branch)})`)
        }
      }
    }
  })

  const subject = subjectCompound(selector)
  const universalSubject =
    !carriesPseudoElement(subject) && !hasQualifyingPart(subject)

  const cost =
    (universalSubject ? UNIVERSAL_SUBJECT_COST : 0) +
    siblingCountingPseudos.length * SIBLING_COUNTING_PSEUDO_COST +
    hasCount * HAS_COST +
    argumentListCount * SELECTOR_ARGUMENT_COST +
    combinatorArguments.length * COMBINATOR_IN_ARGUMENT_COST

  return {
    selector: csstree.generate(selector),
    universalSubject,
    siblingCountingPseudos,
    hasCount,
    combinatorArguments,
    cost,
  }
}

/**
 * Parses a full stylesheet and analyzes every selector a rule is actually
 * keyed on.
 *
 * Walks `Rule` and reads the direct `Selector` children of each prelude,
 * rather than walking `Selector` nodes generically: a generic walk also
 * visits the selectors *inside* `:not()` / `:is()` / `:where()` arguments
 * and scores each as if it were a rule of its own. `:not([data-my-ext] *)`
 * would then report `[data-my-ext] *` as a universal-subject rule once per
 * occurrence — fifteen identical findings for a construct that is really
 * one per-candidate ancestor check, and none of them a rule the engine
 * keys on. Argument cost belongs to the selector that carries the
 * argument, which is what `costOfSelector` already charges it as.
 */
export function analyzeStylesheet(css: string): ReadonlyArray<SelectorCost> {
  const ast = csstree.parse(css)
  const costs: Array<SelectorCost> = []
  csstree.walk(ast, {
    visit: "Rule",
    enter(node: csstree.CssNode) {
      if (node.type !== "Rule") return
      const prelude = node.prelude
      if (!isSelectorList(prelude)) return
      prelude.children.forEach((selector) => {
        if (selector.type === "Selector") costs.push(costOfSelector(selector))
      })
    },
  })
  return costs
}

/** Parses a bare selector (no declaration block) and analyzes it. */
export function analyzeSelector(selector: string): SelectorCost {
  const [only] = analyzeStylesheet(`${selector} { color: red }`)
  if (only === undefined) {
    throw new Error(`not a parseable selector: ${selector}`)
  }
  return only
}

/** Renders violations as a readable, cost-ranked table for an assertion message. */
export function report(costs: ReadonlyArray<SelectorCost>): string {
  return [...costs]
    .sort((a, b) => b.cost - a.cost)
    .map((c) => {
      const why: Array<string> = []
      if (c.universalSubject) why.push("universal subject")
      if (c.siblingCountingPseudos.length > 0) {
        why.push(`sibling-counting ${c.siblingCountingPseudos.join(" ")}`)
      }
      if (c.hasCount > 0) why.push(`${c.hasCount}x :has()`)
      if (c.combinatorArguments.length > 0) {
        why.push(`ancestor-dependent ${c.combinatorArguments.join(" ")}`)
      }
      return `  cost ${String(c.cost).padStart(3)}  ${c.selector}\n           ↳ ${why.join("; ") || "argument evaluation only"}`
    })
    .join("\n")
}
