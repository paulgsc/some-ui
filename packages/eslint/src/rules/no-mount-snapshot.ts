import type { Rule, Scope } from "eslint"

// CallExpression/NewExpression/MemberExpression shapes aren't narrowed
// cleanly through @types/eslint's Node union, so this rule reads ESTree
// nodes as `any` - the convention no-loading-elided-default.ts and
// no-unbounded-intent.ts document.
/* eslint-disable @typescript-eslint/no-explicit-any -- ESTree shapes not modeled precisely by @types/eslint's Node union, see comment above */

/**
 * A React component or hook that seeds `useState`/`useReducer` from one of
 * its own parameters, or from the wall clock, freezes at mount a value its
 * owner keeps changing. The prop moves (a route clears its query, a host's
 * clock ticks, a parent re-renders with a new entry) and the copy doesn't,
 * and whatever is decided from the copy afterwards is decided on stale data.
 * Nothing fails: the screen just acts on the past, and only a careful
 * reader notices.
 *
 * What to do instead, in order:
 *
 * - derive it where it is used (`const ask = askFor(state.source)`), from
 *   the prop or from the owner's own state;
 * - if the read really is once, say so in the name: a parameter called
 *   `initial*` or `default*` is React's convention for "read at mount", and
 *   is not reported;
 * - if it's an edit buffer seeded from what it edits, key the component by
 *   the thing it edits, and disable this line with the reason.
 *
 * Reported: a reference to the enclosing component's or hook's parameter
 * (destructured or not) inside `useState`'s argument or `useReducer`'s
 * initial argument or `init` function; and `new Date()`, `Date.now()` or
 * `performance.now()` there, since the clock is a value the host owns.
 */

const STATE_HOOKS = new Set(["useState", "useReducer"])
const CLOCK_CALLS = new Set(["Date.now", "performance.now"])
const READ_ONCE_NAME = /^(initial|default)[A-Z]/
/** Wrappers a component is declared through: `const Page = memo((...) => ...)`. */
const COMPONENT_WRAPPERS = new Set(["memo", "forwardRef"])

type Node = any

/** `useState`, or `React.useState`, as the name of the hook called. */
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

/** The name a function is known by: its own, or the variable it's assigned to. */
function functionName(fn: Node): string | null {
  let name: unknown = null
  // Through `memo(...)`/`forwardRef(...)`, however nested, to the variable.
  let declared: Node = fn.parent
  while (
    declared.type === "CallExpression" &&
    COMPONENT_WRAPPERS.has(hookName(declared.callee) ?? "")
  ) {
    declared = declared.parent
  }
  if (
    (fn.type === "FunctionDeclaration" || fn.type === "FunctionExpression") &&
    fn.id
  ) {
    name = fn.id.name
  } else if (
    declared.type === "VariableDeclarator" &&
    declared.id.type === "Identifier"
  ) {
    name = declared.id.name
  }
  return typeof name === "string" ? name : null
}

function isComponentOrHook(name: string): boolean {
  return /^[A-Z]/.test(name) || /^use[A-Z0-9]/.test(name)
}

/** The nearest enclosing function that is a component or a hook. */
function owningFunction(node: Node): Rule.Node | null {
  for (let at: Node = node.parent; at; at = at.parent) {
    if (
      at.type === "FunctionDeclaration" ||
      at.type === "FunctionExpression" ||
      at.type === "ArrowFunctionExpression"
    ) {
      const name = functionName(at)
      const fn: Rule.Node = at
      if (name !== null && isComponentOrHook(name)) return fn
    }
  }
  return null
}

function within(inner: Node, outer: Node): boolean {
  const [a, b] = inner.range ?? [0, 0]
  const [c, d] = outer.range ?? [0, 0]
  return a >= c && b <= d
}

/** The arguments that only seed the state: read once, at mount. */
function seeds(call: Node, hook: string): Array<Node> {
  if (call.type !== "CallExpression") return []
  const args: Array<Node> = call.arguments.filter(
    (a: Node) => a.type !== "SpreadElement"
  )
  return hook === "useState" ? args.slice(0, 1) : args.slice(1, 3)
}

/** `Date.now` or `performance.now`, as written, or null. */
function clockFunction(node: Node): string | null {
  if (
    node.type !== "MemberExpression" ||
    node.computed ||
    node.object.type !== "Identifier" ||
    node.property.type !== "Identifier"
  ) {
    return null
  }
  const object: unknown = node.object.name
  const property: unknown = node.property.name
  const name = `${String(object)}.${String(property)}`
  return CLOCK_CALLS.has(name) ? name : null
}

/**
 * A read of the clock: `new Date()`, `Date.now()`, or the function itself
 * passed uncalled (`useState(Date.now)`), which React calls once at mount.
 */
function clockCall(node: Node): string | null {
  if (
    node.type === "NewExpression" &&
    node.callee.type === "Identifier" &&
    node.callee.name === "Date" &&
    node.arguments.length === 0
  ) {
    return "new Date()"
  }
  if (node.type === "CallExpression") {
    const called = clockFunction(node.callee)
    return called === null ? null : `${called}()`
  }
  // Uncalled: the callee of a call is reported as that call, above.
  const passed = clockFunction(node)
  if (passed === null) return null
  const parent: Node = node.parent
  return parent.type === "CallExpression" && parent.callee === node
    ? null
    : passed
}

export const noMountSnapshot: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid seeding React state from a prop or the clock, which freezes at mount a value its owner keeps changing",
    },
    schema: [],
    messages: {
      prop: '"{{name}}" is a parameter of {{owner}}, read here only at mount, so the state goes stale when it changes. Derive it where it is used, or name the parameter initial{{Name}} if reading it once is the intent.',
      clock:
        "{{call}} seeds state with the time at mount, which never moves after. Take `now` from the host's clock instead.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode
    return {
      CallExpression(call: Node): void {
        if (call.type !== "CallExpression") return
        const hook = hookName(call.callee)
        if (hook === null || !STATE_HOOKS.has(hook)) return
        const owner = owningFunction(call)
        if (owner === null) return
        const ownerName = functionName(owner) ?? "this component"
        const params: Array<Scope.Variable> = sourceCode.scopeManager
          .getDeclaredVariables(owner)
          .filter((v) => v.defs.some((d) => d.type === "Parameter"))

        for (const seed of seeds(call, hook)) {
          for (const variable of params) {
            if (READ_ONCE_NAME.test(variable.name)) continue
            const read = variable.references.find((r) =>
              within(r.identifier, seed)
            )
            if (read === undefined) continue
            context.report({
              node: read.identifier,
              messageId: "prop",
              data: {
                name: variable.name,
                Name:
                  variable.name.charAt(0).toUpperCase() +
                  variable.name.slice(1),
                owner: ownerName,
              },
            })
          }
          walk(seed, (node) => {
            const call = clockCall(node)
            if (call !== null) {
              context.report({ node, messageId: "clock", data: { call } })
            }
          })
        }
      },
    }
  },
}

/** Every node under `root`, root included. */
function walk(root: Node, visit: (node: Node) => void): void {
  visit(root)
  const fields: Record<string, unknown> = root
  for (const [key, value] of Object.entries(fields)) {
    if (key === "parent") continue
    const children: Array<Node> = Array.isArray(value) ? value : [value]
    for (const child of children) {
      const node: Node = child
      if (typeof node?.type === "string") walk(node, visit)
    }
  }
}
