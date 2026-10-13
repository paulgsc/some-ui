import type { Rule, Scope } from "eslint"

/* eslint-disable @typescript-eslint/no-explicit-any -- ESTree shapes not modeled precisely by @types/eslint's Node union */

/**
 * The "latest ref": an effect whose only job is `fooRef.current = foo`, so
 * that another effect can read the newest `foo` without re-running when it
 * changes. React 19.2's `useEffectEvent` is that pattern, built in: wrap the
 * code that reads `foo` in an Effect Event and drop the ref and the copying
 * effect. https://react.dev/reference/react/useEffectEvent
 *
 * Reported: an assignment `ref.current = value` in an effect whose body is
 * nothing but such assignments, when `ref` is a `useRef` of the same
 * component or hook, is written nowhere else, and is read only as
 * `ref.current` inside other effects' callbacks. A ref read anywhere else
 * (an event handler, a `useCallback`, a returned API, passed to a function)
 * is not reported: an Effect Event may only be called from an effect, so
 * there the ref is still the tool.
 */

const EFFECT_HOOKS = new Set(["useEffect", "useLayoutEffect"])

type Node = any

function hookName(callee: Node): string | null {
  let name: unknown = null
  if (callee.type === "Identifier") name = callee.name
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    callee.object.name === "React" &&
    callee.property.type === "Identifier"
  ) {
    name = callee.property.name
  }
  return typeof name === "string" ? name : null
}

function effectCallback(node: Node): Rule.Node | null {
  if (node.type !== "CallExpression") return null
  if (!EFFECT_HOOKS.has(hookName(node.callee) ?? "")) return null
  const callback: Rule.Node | undefined = node.arguments[0]
  return callback?.type === "ArrowFunctionExpression" ||
    callback?.type === "FunctionExpression"
    ? callback
    : null
}

/** The statements an effect callback runs, or null for a non-block body we don't model. */
function bodyStatements(callback: Node): Array<Node> {
  const body: Node = callback.body
  if (body.type !== "BlockStatement") {
    return [{ type: "ExpressionStatement", expression: body }]
  }
  const statements: Array<Node> = body.body
  return statements
}

/** `x.current = …`, returning the assignment, or null. */
function currentAssignment(statement: Node): Node | null {
  if (statement.type !== "ExpressionStatement") return null
  const expr = statement.expression
  if (expr.type !== "AssignmentExpression" || expr.operator !== "=") return null
  const target = expr.left
  if (
    target.type !== "MemberExpression" ||
    target.computed ||
    target.property.type !== "Identifier" ||
    target.property.name !== "current" ||
    target.object.type !== "Identifier"
  ) {
    return null
  }
  return expr
}

function within(inner: Node, outer: Node): boolean {
  const [a, b] = inner.range ?? [0, 0]
  const [c, d] = outer.range ?? [0, 0]
  return a >= c && b <= d
}

function isUseRefInit(variable: Scope.Variable): boolean {
  return variable.defs.some((def) => {
    const declarator: Node = def.node
    return (
      def.type === "Variable" &&
      declarator.init?.type === "CallExpression" &&
      hookName(declarator.init.callee) === "useRef"
    )
  })
}

/** The innermost effect callback containing `node`, or null. */
function enclosingEffect(node: Node): Rule.Node | null {
  for (let at: Node = node.parent; at; at = at.parent) {
    const callback = at.parent ? effectCallback(at.parent) : null
    if (callback !== null && callback === at) return callback
  }
  return null
}

export const noLatestRefEffect: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Forbid an effect that only copies a value into a ref read by other effects; use useEffectEvent",
      url: "https://react.dev/reference/react/useEffectEvent",
    },
    schema: [],
    messages: {
      latestRef:
        '"{{name}}" only carries the latest value into other effects. Wrap the code that reads it in useEffectEvent and remove the ref and this effect.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode
    return {
      CallExpression(call: Node): void {
        const callback = effectCallback(call)
        if (callback === null) return
        const statements = bodyStatements(callback)
        const assignments = statements.map(currentAssignment)
        if (assignments.length === 0 || assignments.includes(null)) return

        for (const assignment of assignments) {
          const id: Rule.Node = assignment.left.object
          const variable = sourceCode
            .getScope(id)
            .references.find((r) => r.identifier === id)?.resolved
          if (!variable || !isUseRefInit(variable)) continue

          let reads = 0
          const onlyEffectUse = variable.references.every((ref) => {
            const ident: Node = ref.identifier
            if (ref.init) return true
            const member: Node = ident.parent
            if (
              member.type !== "MemberExpression" ||
              member.object !== ident ||
              member.computed ||
              member.property.name !== "current"
            ) {
              return false
            }
            const effect = enclosingEffect(member)
            if (effect === null) return false
            const isWrite =
              member.parent.type === "AssignmentExpression" &&
              member.parent.left === member
            // Writes count only from copy-only effects like this one; a
            // read counts only from an effect other than the copying one.
            if (isWrite) {
              return bodyStatements(effect).every(
                (s: Node) => currentAssignment(s) !== null
              )
            }
            reads += 1
            return !within(member, callback)
          })
          if (!onlyEffectUse || reads === 0) continue

          context.report({
            node: assignment,
            messageId: "latestRef",
            data: { name: variable.name },
          })
        }
      },
    }
  },
}
