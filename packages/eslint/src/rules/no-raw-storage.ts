import type { Rule } from "eslint"

const RAW_STORAGE_APIS = new Set(["localStorage", "sessionStorage"])

export const noRawStorage: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid direct localStorage/sessionStorage access in extension code; use namespaced browser.storage with the workspace prefix instead (Good-Citizen Charter §4)",
    },
    schema: [
      {
        type: "object",
        properties: {
          allowlist: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      rawStorage:
        '"{{name}}" is not allowed in extension code. Use browser.storage.local (or .session) with the workspace-prefixed key instead.',
    },
  },
  create(context) {
    // context.options is any[] per @types/eslint; no-unsafe-assignment is intentionally off
    const allowlistArr: Array<string> = context.options[0]?.allowlist ?? []
    const allowlist = new Set(allowlistArr)

    return {
      Identifier(rawNode): void {
        // rawNode: any — Rule.RuleListener types all visitor params as any via index signature
        const name: string = rawNode.name
        if (!RAW_STORAGE_APIS.has(name)) return
        if (allowlist.has(name)) return

        const parent = rawNode.parent

        // Skip: used as property key on a member expression (unlikely but safe)
        if (
          parent.type === "MemberExpression" &&
          !parent.computed &&
          parent.property === rawNode
        )
          return

        context.report({
          node: rawNode,
          messageId: "rawStorage",
          data: { name },
        })
      },
    }
  },
}
