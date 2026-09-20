/**
 * Scans the *shipped* JavaScript bundles for occurrences of the effect
 * alphabet, and reports anything it cannot classify.
 *
 * ── why the bundle and not the source tree ───────────────────────────────
 *
 * `dist/content.js` is what the browser actually runs. It already contains
 * every imported workspace package (`@some-extension/transport`,
 * `@some-extension/common`), every npm dependency Rollup pulled in, and any
 * code a build step generated. A source scan over `extensions/some-filter/
 * src/**` sees none of that, which is why the first version of this
 * directory could not make a closure claim: a diff that moved an unbounded
 * walk into a shared package, or into `public/prepaint-start.js` (plain JS,
 * shipped as a `document_start` content script, outside `src/`), changed
 * nothing it looked at.
 *
 * Vite mangles local identifiers here but cannot mangle host property
 * names: `getComputedStyle`, `createTreeWalker` and `adoptedStyleSheets`
 * appear verbatim in the built output because they are properties of
 * objects the bundler does not own. That is the property this scan rests
 * on, and it is checked rather than assumed — see the reconciliation case
 * in `bundle-closure-budget.test.ts`, which fails if a primitive known to
 * be present in source disappears from the bundle (the signature of a
 * bundler change that would silently blind this scan).
 *
 * ── what "unclassified" means ────────────────────────────────────────────
 *
 * Conservative by construction. A computed member access on a host object
 * (`document[name]`), `eval`, or `new Function` could resolve to any
 * alphabet member at runtime, so each is reported as an occurrence that no
 * ledger entry can admit. This is the fail-closed direction: a diff that
 * reaches a traversal primitive dynamically does not slip past the scan, it
 * turns it red with "unclassified effect".
 */

import { readFileSync } from "fs"
import { basename } from "path"
import ts from "typescript"

import { EFFECT_ALPHABET, type EffectKind } from "./effect-alphabet"

export type EffectOccurrence = {
  /** Bundle file, e.g. `content.js`. */
  readonly bundle: string
  /** Alphabet key, or `<dynamic>` / `<eval>` for an unclassifiable access. */
  readonly effect: string
  readonly kind: EffectKind
  /** 1-indexed line in the bundle — coarse, since the bundle is mangled, but enough to locate. */
  readonly line: number
  /** A short slice of the surrounding source, for the failure message. */
  readonly context: string
}

/**
 * Any computed member access whose key is not a literal — `obj[k]`,
 * `map[id]`, `this.items[this.cursor]`. After mangling these are
 * indistinguishable from one another: the object is a one-letter local and
 * there is no type information left, so the scan cannot tell a swatch
 * registry lookup from `document[name]`.
 *
 * They are therefore not classified individually. They are *counted*, and
 * the ledger ratchets the count. That is deliberately a weaker claim than
 * the rest of this scan makes, and it is the claim that is actually true:
 * the gate does not know these are safe, it knows how many there are and
 * that a diff cannot add one without review.
 *
 * This exists because it is the only thing that catches aliasing. An
 * earlier version keyed on the root identifier (`document[x]`, `window[x]`)
 * and was falsified by a two-line mutation — `const d = document as
 * unknown as Record<string, unknown>; d[name]` — because after bundling the
 * root is a mangled local, not `document`. Counting every computed access
 * catches that by arithmetic rather than by recognising the shape.
 */
const UNCLASSIFIED_DYNAMIC = "<computed-member-access>"

function contextAround(text: string, position: number): string {
  const start = Math.max(0, position - 40)
  const slice = text.slice(start, position + 60).replace(/\s+/g, " ")
  return slice.length < text.length ? `…${slice}…` : slice
}

/**
 * The name a node contributes to the alphabet lookup, if any.
 *
 * Handles the three shapes a primitive can take after bundling: a bare
 * identifier (`getComputedStyle(el)`, `new MutationObserver(…)`), a static
 * property access (`window.getComputedStyle`, `el.closest`), and a string
 * literal property in an object pattern or index (`el["closest"]`).
 */
function alphabetNameOf(node: ts.Node): string | null {
  if (ts.isPropertyAccessExpression(node)) {
    const name = node.name.text
    return EFFECT_ALPHABET.has(name) ? name : null
  }
  if (ts.isElementAccessExpression(node)) {
    const argument = node.argumentExpression
    if (ts.isStringLiteralLike(argument)) {
      return EFFECT_ALPHABET.has(argument.text) ? argument.text : null
    }
    return null
  }
  if (ts.isIdentifier(node)) {
    // Only count a bare identifier when it is not the `name` half of a
    // property access — that case is handled above and would double-count.
    //
    // No undefined guard on `parent`: the compiler API types `Node.parent`
    // as `ts.Node`, so testing it is a condition the type system knows is
    // dead. Only the root SourceFile actually has no parent at runtime, and
    // a SourceFile is not an Identifier, so this branch is unreachable for
    // it — the sole node that could throw here never arrives.
    const parent = node.parent
    if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
      return null
    }
    return EFFECT_ALPHABET.has(node.text) ? node.text : null
  }
  return null
}

/**
 * Whether `node` is a computed member access whose object could be a host
 * object — `document[x]`, `window[expr]`, `el[key]()`. Deliberately keyed
 * on the *root* identifier rather than attempting type inference on a
 * mangled bundle: after mangling, an element variable is called `e`, so
 * there is no name to match. The roots below are the ones that survive
 * mangling because they are globals.
 */
function isOpaqueDynamicAccess(node: ts.Node): boolean {
  if (!ts.isElementAccessExpression(node)) return false
  const key = node.argumentExpression
  // A string-literal key is handled by `alphabetNameOf` — it is readable and
  // therefore classifiable. A numeric-literal key is array indexing and
  // cannot name a DOM primitive.
  if (ts.isStringLiteralLike(key) || ts.isNumericLiteral(key)) return false
  return true
}

/** Scans one bundle file. `bundlePath` must be an absolute path to shipped JS. */
export function scanBundle(
  bundlePath: string
): ReadonlyArray<EffectOccurrence> {
  const text = readFileSync(bundlePath, "utf8")
  const bundle = basename(bundlePath)
  const source = ts.createSourceFile(
    bundlePath,
    text,
    ts.ScriptTarget.ES2020,
    /* setParentNodes */ true,
    ts.ScriptKind.JS
  )

  const occurrences: Array<EffectOccurrence> = []

  const record = (node: ts.Node, effect: string, kind: EffectKind): void => {
    const position = node.getStart(source)
    const { line } = source.getLineAndCharacterOfPosition(position)
    occurrences.push({
      bundle,
      effect,
      kind,
      line: line + 1,
      context: contextAround(text, position),
    })
  }

  const visit = (node: ts.Node): void => {
    if (isOpaqueDynamicAccess(node)) {
      record(node, UNCLASSIFIED_DYNAMIC, "opaque")
    } else {
      const name = alphabetNameOf(node)
      if (name !== null) {
        // `alphabetNameOf` only returns names it found in the alphabet, so
        // this lookup cannot miss; `?? "opaque"` keeps that total without a
        // condition the type system knows is dead.
        record(node, name, EFFECT_ALPHABET.get(name) ?? "opaque")
      }
    }
    node.forEachChild(visit)
  }

  visit(source)
  return occurrences
}

/** Groups occurrences by effect name, preserving order of first appearance. */
export function tallyByEffect(
  occurrences: ReadonlyArray<EffectOccurrence>
): ReadonlyMap<string, ReadonlyArray<EffectOccurrence>> {
  const byEffect = new Map<string, Array<EffectOccurrence>>()
  for (const occurrence of occurrences) {
    const existing = byEffect.get(occurrence.effect)
    if (existing === undefined) byEffect.set(occurrence.effect, [occurrence])
    else existing.push(occurrence)
  }
  return byEffect
}

export { UNCLASSIFIED_DYNAMIC }
