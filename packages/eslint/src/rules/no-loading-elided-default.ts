import type { Rule } from "eslint"

// ESTree shapes aren't narrowed cleanly by @types/eslint's Node union.
/* eslint-disable @typescript-eslint/no-explicit-any -- ESTree shapes not modeled precisely by @types/eslint's Node union, see comment above */

/**
 * `const { data: sessions = [] } = useSessions()` looks safe and is not:
 * `data` is `undefined` while pending *and* after failing, so the default
 * makes both look like a genuine empty result (#968). Destructuring
 * `isLoading`/`isPending`/`isError`/`error`/`status` in the same statement
 * is the signal the caller reads the state.
 */
const SIBLING_STATE_KEYS = new Set([
  "isLoading",
  "isPending",
  "isError",
  "error",
  "status",
])

/** Any `use*()`, on purpose: the signal is the destructuring shape, and an
 * allowlist would miss app wrappers (`useSessions`) around `useQuery`. */

const HOOK_CALL_PATTERN = /^use[A-Z]/

function isHookCall(init: any): boolean {
  if (init?.type !== "CallExpression") return false
  const callee = init.callee
  if (callee.type !== "Identifier") return false
  const name: string = callee.name
  return HOOK_CALL_PATTERN.test(name)
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
