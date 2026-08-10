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
 * sessions/index.tsx, settings.tsx). Resolving arbitrary identifiers would
 * need full scope/data-flow analysis; this AST-local heuristic covers the
 * pattern every producer in the app actually uses. */
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

function enclosingFunction(node: any): any {
  let current = node.parent
  while (current) {
    const currentType: string = current.type
    if (FUNCTION_TYPES.has(currentType)) return current
    current = current.parent
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

    // Two-pass: JSX attributes and handler declarations can appear in
    // either order in the file, so producers/candidate calls are resolved
    // once the whole file has been seen rather than as each is visited.
    const producers = new Set<any>()
    const namedHandlers = new Map<string, any>()
    const referencedNames = new Set<string>()
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
          if (HANDLER_NAME_PATTERN.test(handlerName)) {
            referencedNames.add(handlerName)
          }
        }
      },
      FunctionDeclaration(rawNode: any): void {
        const node = rawNode
        const id = node.id
        if (!id) return
        const handlerName: string = id.name
        if (HANDLER_NAME_PATTERN.test(handlerName)) {
          namedHandlers.set(handlerName, node)
        }
      },
      VariableDeclarator(rawNode: any): void {
        const node = rawNode
        const id = node.id
        const idType: string = id.type
        const init = node.init
        const initType: string | undefined = init?.type
        if (idType !== "Identifier" || initType === undefined) return
        const handlerName: string = id.name
        if (
          HANDLER_NAME_PATTERN.test(handlerName) &&
          FUNCTION_TYPES.has(initType)
        ) {
          namedHandlers.set(handlerName, init)
        }
      },
      CallExpression(rawNode: any): void {
        const node = rawNode
        if (isEffectCall(node) && !isAllowedCall(node)) {
          candidateCalls.push(node)
        }
      },
      "Program:exit"(): void {
        for (const name of referencedNames) {
          const fn = namedHandlers.get(name)
          if (fn) producers.add(fn)
        }

        for (const call of candidateCalls) {
          const fn = enclosingFunction(call)
          if (!fn || !producers.has(fn)) continue
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
