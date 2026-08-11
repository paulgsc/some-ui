import type { Rule } from "eslint"

/**
 * The one CSS rule that defeats containment by composition:
 *
 * > A flex item's automatic minimum size is its *content* size, not zero.
 *
 * So `flex-1` on a child of a bounded column does not mean "take what is
 * left". It means "take what is left, but never less than my content" - and a
 * child whose content is taller than the space available silently raises the
 * floor of every ancestor up to the one that clips. That is how a panel handed
 * a ~340px rect painted ~950px of quiz summary over the pane below it (#899):
 * every box in the chain was correct on its own, and each one asserted a
 * minimum its parent could not honour.
 *
 * `min-h-0` / `min-w-0` restores the shrinkable contract. So does any overflow
 * other than `visible`, which sets the automatic minimum size to zero - which
 * is why `overflow-auto`, `overflow-hidden` and scroll-area wrappers are not
 * flagged: they have said what happens to the excess.
 *
 * This is the authoring-time half. The half that proves the result is
 * `apps/www/tests/ui-fit/panel-fit.spec.ts`, which measures a panel in a real
 * rect - a lint rule can see that a box may not shrink, never that it needed
 * to.
 */

// rawNode: any — JSX shapes are not modeled by @types/eslint's ESTree Node
// union; same convention as theme-protocol.ts and the other rules here.
/* eslint-disable @typescript-eslint/no-explicit-any -- see comment above */

/** The axis a parent's `flex-*` classes lay children out along. */
type Axis = "row" | "column"

const FLEXIBLE = /(^|\s)(flex-1|flex-auto|grow)(\s|$)/
const COLUMN = /(^|\s)flex-col(\s|$)/
const ROW = /(^|\s)flex-row(\s|$)/
const IS_FLEX = /(^|\s)(flex|inline-flex)(\s|$)/

/**
 * Anything that zeroes the automatic minimum size, per CSS box sizing.
 *
 * `basis-0` is deliberately absent: `flex-basis: 0` sets the item's *initial*
 * main size, and says nothing about its minimum. `min-height` stays `auto`,
 * which resolves to the content's min-content height - so `flex-1 basis-0`
 * with tall content still raises the floor, which is the failure this rule is
 * about.
 */
const SHRINKABLE: Record<Axis, RegExp> = {
  column:
    /(^|\s)(min-h-0|h-0|overflow-(auto|hidden|scroll|clip)|overflow-y-(auto|hidden|scroll|clip))(\s|$)/,
  row: /(^|\s)(min-w-0|w-0|overflow-(auto|hidden|scroll|clip)|overflow-x-(auto|hidden|scroll|clip))(\s|$)/,
}

/**
 * Every string literal reachable from a `className` value.
 *
 * Conditional and helper-call parts are read too - `cn("flex-1", active &&
 * "ring-2")` is the ordinary shape here - but nothing is inferred about which
 * branch wins. A class that appears anywhere in the expression counts as
 * present, which errs towards *not* reporting when a fix is applied
 * conditionally.
 */
/** Array-ish AST children, narrowed rather than asserted. */
function children(value: unknown): Array<unknown> {
  return Array.isArray(value) ? value : []
}

function collectStrings(node: any, into: Array<string>): void {
  if (node === null || typeof node !== "object") return

  const type: unknown = node.type

  if (type === "Literal") {
    const value: unknown = node.value
    if (typeof value === "string") into.push(value)
    return
  }

  if (type === "TemplateLiteral") {
    for (const quasi of children(node.quasis)) {
      if (quasi === null || typeof quasi !== "object") continue
      if (!("value" in quasi)) continue
      const cooked: unknown = quasi.value
      if (cooked === null || typeof cooked !== "object") continue
      if (!("raw" in cooked)) continue
      const raw: unknown = cooked.raw
      if (typeof raw === "string") into.push(raw)
    }
    for (const expression of children(node.expressions)) {
      collectStrings(expression, into)
    }
    return
  }

  // `cn(…)` / `clsx(…)` and friends: every argument is a candidate class list.
  if (type === "CallExpression") {
    for (const argument of children(node.arguments)) {
      collectStrings(argument, into)
    }
    return
  }

  if (type === "ArrayExpression") {
    for (const element of children(node.elements)) {
      collectStrings(element, into)
    }
    return
  }

  if (type === "ConditionalExpression") {
    collectStrings(node.consequent, into)
    collectStrings(node.alternate, into)
    return
  }

  // `active && "ring-2"` - only the right side can contribute classes.
  if (type === "LogicalExpression") {
    collectStrings(node.right, into)
  }
}

/** Static class text of a JSX element's `className`, or null if it has none. */
function classNameOf(node: any): string | null {
  const attributes: Array<any> = node?.openingElement?.attributes ?? []
  const parts: Array<string> = []

  for (const attribute of attributes) {
    if (attribute?.type !== "JSXAttribute") continue
    if (attribute.name?.name !== "className") continue

    const value = attribute.value
    if (value?.type === "JSXExpressionContainer") {
      collectStrings(value.expression, parts)
    } else {
      collectStrings(value, parts)
    }
  }

  return parts.length > 0 ? parts.join(" ") : null
}

/**
 * Nodes that can sit between an element and the element that lays it out
 * without introducing a box of their own - fragments, `{cond && …}`, a
 * `.map()` body.
 */
const TRANSPARENT = new Set([
  "JSXFragment",
  "JSXExpressionContainer",
  "ConditionalExpression",
  "LogicalExpression",
  "ArrowFunctionExpression",
  "FunctionExpression",
  "CallExpression",
  "ReturnStatement",
  "BlockStatement",
  "ArrayExpression",
  "ParenthesizedExpression",
])

/** The axis of the nearest enclosing flex container, if that is what it is. */
function flexParentAxis(node: any): Axis | null {
  let scope: any = node.parent ?? null

  while (scope) {
    if (scope.type === "JSXElement") {
      const classes = classNameOf(scope)
      if (classes === null || !IS_FLEX.test(classes)) return null
      if (COLUMN.test(classes)) return "column"
      if (ROW.test(classes)) return "row"
      // `flex` with no direction is a row.
      return "row"
    }
    if (!TRANSPARENT.has(String(scope.type))) return null
    scope = scope.parent ?? null
  }

  return null
}

export const noUnshrinkableFlexChild: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "A flexible child of a flex container must stay shrinkable (min-h-0 / min-w-0, or an overflow that zeroes its automatic minimum size), so tall content cannot raise the floor of the box it was given",
    },
    schema: [],
    messages: {
      unshrinkable:
        "`{{flexible}}` inside a {{direction}} parent, without `{{fix}}`. A flex item's automatic minimum size is its content, so this child cannot shrink below what it holds — tall content then pushes past the box its ancestors were given instead of fitting inside it (#899, docs/ui-fit). Add `{{fix}}`, or an `overflow-*` that says how the excess is handled.",
    },
  },
  create(context): Rule.RuleListener {
    function check(rawNode: any): void {
      const classes = classNameOf(rawNode)
      if (classes === null || !FLEXIBLE.test(classes)) return

      const axis = flexParentAxis(rawNode)
      if (axis === null) return
      if (SHRINKABLE[axis].test(classes)) return

      context.report({
        node: rawNode,
        messageId: "unshrinkable",
        data: {
          flexible: FLEXIBLE.exec(classes)?.[0]?.trim() ?? "flex-1",
          direction: axis === "column" ? "`flex-col`" : "flex row",
          fix: axis === "column" ? "min-h-0" : "min-w-0",
        },
      })
    }

    return { JSXElement: check }
  },
}
