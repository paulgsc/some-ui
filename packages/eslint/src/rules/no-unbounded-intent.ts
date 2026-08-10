import type { Rule } from "eslint"

// JSX/CallExpression/VariableDeclarator shapes aren't narrowed cleanly
// through @types/eslint's Node union across nested `.type` checks, so this
// rule reads several values as `any` - same convention documented in
// require-fail-fast-default.ts.
/* eslint-disable @typescript-eslint/no-explicit-any -- ESTree shapes not modeled precisely by @types/eslint's Node union, see comment above */

const DEFAULT_EFFECT_CALLEES: ReadonlyArray<string> = [
  "fetch",
  "mutate",
  "mutateAsync",
]

/** JSX event-handler-shaped prop: `onClick`, `onSubmit`, `onPress`, a
 * custom component's `onRetry` - deliberately broad. Over-matching here is
 * harmless because the actual signal is the effect call found inside, not
 * the prop name. */
const HANDLER_PROP_PATTERN = /^on[A-Z]/

/** This codebase's own naming convention for a handler referenced by
 * identifier rather than declared inline - `handleSaveDraft`,
 * `handleDelete`, `handleStatusChange`, etc. (see session-composer.tsx,
 * sessions/index.tsx, settings.tsx). Deliberately scoped to this naming
 * convention rather than resolving arbitrary identifiers (a prop drilled
 * down from a parent, an imported callback) - those have no local body this
 * rule can see anyway. What *is* resolved lexically rather than by name
 * alone: see `resolveHandlerFunction` below. */
const HANDLER_NAME_PATTERN = /^handle[A-Z0-9]/

const OPT_OUT = "intent-exempt:"

const FUNCTION_TYPES = new Set([
  "ArrowFunctionExpression",
  "FunctionExpression",
  "FunctionDeclaration",
])

function calleeName(call: any): string | null {
  const callee = call.callee
  const calleeType: string = callee.type
  if (calleeType === "Identifier") {
    const name: string = callee.name
    return name
  }
  if (calleeType === "MemberExpression" && !callee.computed) {
    const property = callee.property
    const propertyType: string = property.type
    if (propertyType === "Identifier") {
      const name: string = property.name
      return name
    }
  }
  return null
}

/**
 * Whether `call` is lexically nested inside any function that is itself a
 * registered producer - not only the *nearest* enclosing one. A producer's
 * body can wrap the effect in another closure (`items.forEach(() =>
 * mutation.mutate())`, a `.then()`, an IIFE) without that closure itself
 * being the JSX handler; the effect is still initiated by the click. Walking
 * past the first function found (rather than stopping there) is what makes
 * that still count.
 */
function isInsideProducer(node: any, producers: ReadonlySet<any>): boolean {
  let current = node.parent
  while (current) {
    const currentType: string = current.type
    if (FUNCTION_TYPES.has(currentType) && producers.has(current)) {
      return true
    }
    current = current.parent
  }
  return false
}

/**
 * Resolves a `handle*`-named JSX handler prop's `Identifier` to the
 * function it actually refers to, via real lexical scoping rather than a
 * file-wide name lookup - two components in the same file each declaring
 * their own `handleSave` must not be conflated, in either direction (an
 * earlier dirty one hidden by a later clean one of the same name, or a
 * clean one blamed for an unrelated dirty one). `context.sourceCode`'s
 * scope analysis is computed for the whole file up front, so this resolves
 * correctly regardless of whether the declaration appears before or after
 * the JSX in source order.
 */
function resolveHandlerFunction(context: Rule.RuleContext, expr: any): any {
  const exprNode: Rule.Node = expr
  const scope = context.sourceCode.getScope(exprNode)
  const reference = scope.references.find((ref: any) => ref.identifier === expr)
  const variable = reference?.resolved
  const def = variable?.defs[0]
  if (!def) return null
  if (def.type === "FunctionName") return def.node
  if (def.type === "Variable") {
    const init = def.node.init
    const initType: string | undefined = init?.type
    if (initType !== undefined && FUNCTION_TYPES.has(initType)) return init
  }
  return null
}

export const noUnboundedIntent: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid initiating an effect (fetch/.mutate/.mutateAsync/configured) directly from inside a JSX event-handler producer - route it through useIntent/useAsyncIntent so a failure has somewhere to go (#937 S1)",
    },
    schema: [
      {
        type: "object",
        properties: {
          // The census this rule is written against found four effect
          // kinds; there will be a fifth - configure it rather than
          // waiting for a rule change.
          effectCallees: {
            type: "array",
            items: { type: "string", minLength: 1 },
          },
          // Boundary callees beyond useIntent/useAsyncIntent's own
          // start/retry (which never match effectCallees' default names,
          // so they need no entry here) - e.g. a project-specific wrapper
          // that already routes through the boundary under a different
          // name.
          allowedCallees: {
            type: "array",
            items: { type: "string", minLength: 1 },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unboundedIntent:
        '"{{name}}(...)" is called directly inside a UI event handler. An effect started outside the intent boundary can fail with nothing telling the person - route it through useIntent (or useAsyncIntent) so the failure has somewhere to go. If this genuinely must bypass the boundary, record why on the line above: // {{optOut}} <reason>.',
    },
  },
  create(context) {
    // context.options is any[] per @types/eslint; no-unsafe-assignment is intentionally off
    const rawEffect: unknown = context.options[0]?.effectCallees
    const effectNames = new Set<string>(
      Array.isArray(rawEffect) && rawEffect.length > 0
        ? rawEffect.filter(
            (entry): entry is string => typeof entry === "string"
          )
        : DEFAULT_EFFECT_CALLEES
    )
    const rawAllowed: unknown = context.options[0]?.allowedCallees
    const allowedNames = new Set<string>(
      Array.isArray(rawAllowed)
        ? rawAllowed.filter(
            (entry): entry is string => typeof entry === "string"
          )
        : []
    )

    const source = context.sourceCode

    // Producers are registered as they're found (an inline function is
    // added immediately; a `handle*` reference is resolved to its
    // declaration via scope, which doesn't depend on traversal order).
    // Effect calls are still collected and checked at `Program:exit`,
    // because the JSX attribute that makes a given function a producer can
    // appear later in the file than the effect call inside it.
    const producers = new Set<any>()
    const candidateCalls: Array<any> = []

    function isEffectCall(call: any): boolean {
      const name = calleeName(call)
      return name !== null && effectNames.has(name)
    }

    function isAllowedCall(call: any): boolean {
      if (allowedNames.size === 0) return false
      const name = calleeName(call)
      return name !== null && allowedNames.has(name)
    }

    function hasOptOut(node: any): boolean {
      let scope: any = node
      for (let depth = 0; depth < 4 && scope; depth += 1) {
        const scopeNode: Rule.Node = scope
        const before = source.getCommentsBefore(scopeNode)
        if (before.some((comment) => comment.value.includes(OPT_OUT)))
          return true
        scope = scope.parent ?? null
      }
      return false
    }

    return {
      // JSXAttribute isn't one of Rule.RuleListener's known keys, so its
      // param doesn't get the implicit `any` the other visitors below get
      // from the index signature - annotated explicitly, same convention.
      JSXAttribute(rawNode: any): void {
        const node = rawNode
        const attrName: unknown = node.name?.name
        if (
          typeof attrName !== "string" ||
          !HANDLER_PROP_PATTERN.test(attrName)
        )
          return
        const value = node.value
        if (value?.type !== "JSXExpressionContainer") return
        const expr = value.expression
        const exprType: string | undefined = expr?.type
        if (exprType !== undefined && FUNCTION_TYPES.has(exprType)) {
          producers.add(expr)
          return
        }
        if (exprType === "Identifier") {
          const handlerName: string = expr.name
          if (!HANDLER_NAME_PATTERN.test(handlerName)) return
          const resolved = resolveHandlerFunction(context, expr)
          if (resolved) producers.add(resolved)
        }
      },
      CallExpression(rawNode: any): void {
        const node = rawNode
        if (isEffectCall(node) && !isAllowedCall(node)) {
          candidateCalls.push(node)
        }
      },
      "Program:exit"(): void {
        for (const call of candidateCalls) {
          if (!isInsideProducer(call, producers)) continue
          if (hasOptOut(call)) continue

          context.report({
            node: call,
            messageId: "unboundedIntent",
            data: { name: calleeName(call) ?? "effect", optOut: OPT_OUT },
          })
        }
      },
    }
  },
}
