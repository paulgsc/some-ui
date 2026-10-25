import type { Rule } from "eslint"
import type * as ESTree from "estree"

import { propertyName, stringOption } from "./ast-names.js"
import { isGlobal, PAGE_LIFETIME_TARGETS } from "./require-scoped-lifetime.js"

/**
 * Invariant MB3 in apps/mailbox's README: no token reaches a log. `console`
 * is used only by the reporter, which logs an error's message, never a
 * request, a header or a body. Configured with the reporter's name (any
 * function of that name counts), it reports every reference to the global
 * `console`, bare or through `globalThis` / `window` / `self`, except a
 * direct `console.<method>(…)` call inside that function, and, in such a
 * call, any argument other than:
 *
 *   - a string (a literal, or a template with no `${}`);
 *   - `<p>.message`, where `<p>` is the reporter's first parameter;
 *   - a conditional (`a ? b : c`) whose two branches are each one of these.
 *
 * `no-console` still asks for a visible disable at the call. Whether an
 * error's message can carry a token is MB3's reading.
 */
export const consoleReportsMessageOnly: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Log only an error's message, from one reporter (mailbox invariant MB3)",
    },
    schema: [
      {
        type: "object",
        properties: { reporter: { type: "string", minLength: 1 } },
        required: ["reporter"],
        additionalProperties: false,
      },
    ],
    messages: {
      outside:
        "`console` is used only inside `{{reporter}}`: report a failure through it (apps/mailbox README, MB3).",
      argument:
        "`{{reporter}}` logs a string or the error's `message`, never a request, a header or a body (apps/mailbox README, MB3).",
    },
  },
  create(context) {
    const reporter = stringOption(context.options[0], "reporter")
    if (reporter === null) return {}
    const data = { reporter }
    return {
      // `globalThis.console` (or `window`, `self`) is console outside the
      // reporter, which uses the bare name.
      MemberExpression(node): void {
        if (
          propertyName(node) === "console" &&
          node.object.type === "Identifier" &&
          PAGE_LIFETIME_TARGETS.has(node.object.name) &&
          isGlobal(node.object.name, context.sourceCode.getScope(node))
        )
          context.report({ node, messageId: "outside", data })
      },
      Identifier(node): void {
        if (node.name !== "console" || !isReference(node)) return
        if (!isGlobal("console", context.sourceCode.getScope(node))) return
        const call = directCall(node)
        const fn = call && enclosingFunction(call)
        if (!call || !fn || functionName(fn) !== reporter) {
          context.report({ node, messageId: "outside", data })
          return
        }
        const param = fn.params[0]
        const errorName = param?.type === "Identifier" ? param.name : null
        for (const argument of call.arguments)
          if (!isAllowed(argument, errorName))
            context.report({ node: argument, messageId: "argument", data })
      },
    }
  },
}

/** `console` as a value, not a property name or an object key. */
function isReference(
  node: ESTree.Identifier & Rule.NodeParentExtension
): boolean {
  const parent = node.parent
  if (parent.type === "MemberExpression")
    return parent.object === node || parent.computed
  if (
    parent.type === "Property" ||
    parent.type === "PropertyDefinition" ||
    parent.type === "MethodDefinition"
  )
    return parent.key !== node || parent.computed
  return true
}

/** The `console.x(…)` call `identifier` is the object of, if it is one. */
function directCall(
  identifier: ESTree.Identifier & Rule.NodeParentExtension
): Extract<Rule.Node, { type: "CallExpression" }> | null {
  const member = identifier.parent
  if (member.type !== "MemberExpression" || member.object !== identifier)
    return null
  const call = member.parent
  if (call.type !== "CallExpression" || call.callee !== member) return null
  return call
}

type FunctionNode = Extract<
  Rule.Node,
  {
    type:
      | "FunctionDeclaration"
      | "FunctionExpression"
      | "ArrowFunctionExpression"
  }
>

function enclosingFunction(node: Rule.Node): FunctionNode | null {
  for (let at = node.parent; at !== null; at = at.parent)
    if (
      at.type === "FunctionDeclaration" ||
      at.type === "FunctionExpression" ||
      at.type === "ArrowFunctionExpression"
    )
      return at
  return null
}

function functionName(fn: FunctionNode): string | null {
  // A default-exported declaration has no id, whatever the type says.
  if (fn.type === "FunctionDeclaration") return nameOf(fn.id)
  const parent = fn.parent
  if (parent.type === "VariableDeclarator" && parent.id.type === "Identifier")
    return parent.id.name
  return null
}

function nameOf(id: ESTree.Identifier | null): string | null {
  return id === null ? null : id.name
}

function isAllowed(
  node: ESTree.Expression | ESTree.SpreadElement,
  errorName: string | null
): boolean {
  if (node.type === "Literal") return typeof node.value === "string"
  if (node.type === "TemplateLiteral") return node.expressions.length === 0
  if (node.type === "MemberExpression")
    return (
      errorName !== null &&
      !node.computed &&
      node.object.type === "Identifier" &&
      node.object.name === errorName &&
      node.property.type === "Identifier" &&
      node.property.name === "message"
    )
  if (node.type === "ConditionalExpression")
    return (
      isAllowed(node.consequent, errorName) &&
      isAllowed(node.alternate, errorName)
    )
  return false
}
