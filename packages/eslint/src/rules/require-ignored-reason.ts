import type { Rule } from "eslint"
import type * as ESTree from "estree"

import { commentBlockAbove } from "./comment-block.js"

/**
 * Invariant FT2 in docs/monorepo-boundaries.md ("A failure reaches the
 * log"): a catch that drops its error without a statement says why, in a
 * line starting `Ignored:`. Modelled on L3's `Lifetime:` line
 * (`require-lifetime-comment`).
 *
 * Two shapes are held, the two that do nothing with what they catch:
 *
 *   - a `catch` clause whose block has no statement (empty, or comments
 *     only): the line is a comment inside that block;
 *   - a promise's `.catch(handler)` whose handler does nothing: an empty
 *     block body, or a body of `undefined`, `null` or `void …`. The line
 *     is a comment inside the handler, or in the unbroken run of `//`
 *     comment lines directly above the line `.catch` is on, or above the
 *     first line of the statement holding the call.
 *
 * The rule checks only that the line is there. Whether it is true, whether
 * dropping that error loses nothing a person or a log needed, needs a
 * person to read it, and that half of FT2 stays with review. A catch with a
 * statement (a fallback value, a `return false`) is not held: it does
 * something, and what it does is the reason a reader sees.
 */
export const requireIgnoredReason: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require an `Ignored:` comment line on every catch that drops its error without a statement (invariant FT2)",
    },
    schema: [],
    messages: {
      clause:
        "This catch drops its error. Say why that loses nothing in a comment line starting `Ignored:` inside it, or report the failure (`reportFailure`, @some-ui/intent-kit). docs/monorepo-boundaries.md, FT2.",
      handler:
        "This `.catch` drops its error. Say why that loses nothing in a comment line starting `Ignored:` inside the handler or directly above, or report the failure (`reportFailure`, @some-ui/intent-kit). docs/monorepo-boundaries.md, FT2.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode

    const saysIgnored = (comment: ESTree.Comment): boolean =>
      comment.value.split("\n").some((line) => /^[\s*]*Ignored:/.test(line))

    const ignoredWithin = (node: ESTree.Node): boolean => {
      const [start, end] = node.range ?? [0, 0]
      return sourceCode
        .getAllComments()
        .some(
          (comment) =>
            comment.range !== undefined &&
            comment.range[0] >= start &&
            comment.range[1] <= end &&
            saysIgnored(comment)
        )
    }

    const blockAbove = commentBlockAbove(sourceCode)
    const ignoredAbove = (line: number): boolean =>
      blockAbove(line, saysIgnored)

    return {
      CatchClause(node): void {
        if (node.body.body.length > 0) return
        if (ignoredWithin(node.body)) return
        context.report({ node, messageId: "clause" })
      },
      CallExpression(node): void {
        const callee = node.callee
        if (
          callee.type !== "MemberExpression" ||
          callee.computed ||
          callee.property.type !== "Identifier" ||
          callee.property.name !== "catch" ||
          node.arguments.length !== 1
        )
          return
        const handler = node.arguments[0]
        if (!handler || !doesNothing(handler)) return
        if (ignoredWithin(handler)) return
        const catchLine = callee.property.loc?.start.line
        if (catchLine !== undefined && ignoredAbove(catchLine)) return
        const statementLine = enclosingStatement(node)?.loc?.start.line
        if (statementLine !== undefined && ignoredAbove(statementLine)) return
        context.report({ node: callee.property, messageId: "handler" })
      },
    }
  },
}

/** A function that drops what it is given and does nothing. */
function doesNothing(node: ESTree.Node): boolean {
  if (
    node.type !== "ArrowFunctionExpression" &&
    node.type !== "FunctionExpression"
  )
    return false
  const body = node.body
  if (body.type === "BlockStatement") return body.body.length === 0
  if (body.type === "Identifier") return body.name === "undefined"
  if (body.type === "Literal") return body.value === null
  return body.type === "UnaryExpression" && body.operator === "void"
}

function enclosingStatement(node: Rule.Node): Rule.Node | null {
  for (let at: Rule.Node | null = node.parent; at !== null; at = at.parent)
    if (at.type.endsWith("Statement") || at.type.endsWith("Declaration"))
      return at
  return null
}
