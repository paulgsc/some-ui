import type { Rule } from "eslint"

// ObjectPattern/Property/CallExpression shapes aren't narrowed cleanly
// through @types/eslint's Node union across nested `.type` checks, so this
// rule reads several values as `any` - same convention documented in
// no-unbounded-intent.ts/require-fail-fast-default.ts.
/* eslint-disable @typescript-eslint/no-explicit-any -- ESTree shapes not modeled precisely by @types/eslint's Node union, see comment above */

/**
 * #968/MS8: `const { data: sessions = [] } = useSessions()` reads exactly
 * like a safe default and is the opposite - `data` is `undefined` while a
 * query is pending *and* after it fails, so a `= []` (or any other default)
 * makes both of those collapse into the same value as a genuine successful
 * empty result. Nothing downstream that only ever sees `sessions` can tell
 * the three apart. Destructuring `isLoading`/`isPending`/`isError`/`error`/
 * `status` alongside `data` in the same statement is this rule's signal
 * that the caller is (at least trying to) read the state rather than
 * silently defaulting past it.
 */
const SIBLING_STATE_KEYS = new Set([
  "isLoading",
  "isPending",
  "isError",
  "error",
  "status",
])

/** React hook naming convention - broad on purpose. The distinctive signal
 * this rule reports on is the destructuring shape (a defaulted `data` with
 * no sibling state key), not the callee's exact identity; there is no type
 * information here to confirm a given `use*()` actually returns a
 * `UseQueryResult`, and requiring an exact allowlist would miss every
 * app-specific wrapper (`useSessions`, `useProfile`, ...) that closes over
 * `useQuery` rather than being named `useQuery` itself. */
const HOOK_CALL_PATTERN = /^use[A-Z]/

function isHookCall(init: any): boolean {
  if (!init || init.type !== "CallExpression") return false
  const callee = init.callee
  return callee.type === "Identifier" && HOOK_CALL_PATTERN.test(callee.name)
}

export const noLoadingElidedDefault: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid destructuring a query hook's data with a default value in the same statement that omits isLoading/isPending/isError/error/status - the default silently stands in for both 'still loading' and 'failed' (#933/#968)",
    },
    schema: [
      {
        type: "object",
        properties: {
          dataKeys: { type: "array", items: { type: "string", minLength: 1 } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      loadingElidedDefault:
        '"{{name}}" is destructured with a default value from what looks like a query hook ("{{name}}: ... = ..."), without also reading isLoading/isPending/isError/error/status in the same statement. The default cannot be told apart from a legitimate result once the query settles - a pending or failed read silently looks identical to it. Destructure the read state alongside "{{name}}" (or branch through a query-outcome adapter) instead of defaulting it away.',
    },
  },
  create(context) {
    // context.options is any[] per @types/eslint; no-unsafe-assignment is intentionally off
    const rawDataKeys: unknown = context.options[0]?.dataKeys
    const dataKeys = new Set<string>(
      Array.isArray(rawDataKeys) && rawDataKeys.length > 0
        ? rawDataKeys.filter(
            (entry): entry is string => typeof entry === "string"
          )
        : ["data"]
    )

    return {
      VariableDeclarator(rawNode: any): void {
        const node = rawNode
        const id = node.id
        if (id.type !== "ObjectPattern") return
        if (!isHookCall(node.init)) return

        const properties: Array<any> = id.properties
        let sawSiblingState = false
        const defaultedDataProps: Array<any> = []

        for (const prop of properties) {
          if (prop.type !== "Property") continue
          const key = prop.key
          const keyName: string | undefined =
            key?.type === "Identifier" ? key.name : undefined
          if (keyName === undefined) continue

          if (SIBLING_STATE_KEYS.has(keyName)) {
            sawSiblingState = true
            continue
          }

          if (
            dataKeys.has(keyName) &&
            prop.value?.type === "AssignmentPattern"
          ) {
            defaultedDataProps.push(prop)
          }
        }

        if (sawSiblingState) return

        for (const prop of defaultedDataProps) {
          const left = prop.value.left
          const propKey = prop.key
          const name: string =
            left?.type === "Identifier" ? left.name : propKey.name
          context.report({
            node: prop,
            messageId: "loadingElidedDefault",
            data: { name },
          })
        }
      },
    }
  },
}
