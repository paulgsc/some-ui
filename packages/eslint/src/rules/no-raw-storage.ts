import type { Rule } from "eslint"

const RAW_STORAGE_APIS = new Set(["localStorage", "sessionStorage"])

/** The globals a page's storage is also reached through. */
const GLOBALS = new Set(["window", "globalThis", "self"])

const EXTENSION_REMEDY =
  "Use browser.storage.local (or .session) with the workspace-prefixed key instead."

export const noRawStorage: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid direct localStorage/sessionStorage access, bare or through window, globalThis or self: in extension code use namespaced browser.storage (Good-Citizen Charter §4); in apps/www and packages/ui go through core-utils' storage owner (KR1)",
    },
    schema: [
      {
        type: "object",
        properties: {
          allowlist: { type: "array", items: { type: "string" } },
          remedy: { type: "string" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      rawStorage: '"{{name}}" is not allowed here. {{remedy}}',
    },
  },
  create(context) {
    // context.options is any[] per @types/eslint; no-unsafe-assignment is intentionally off
    const allowlistArr: Array<string> = context.options[0]?.allowlist ?? []
    const allowlist = new Set(allowlistArr)
    const remedy: string = context.options[0]?.remedy ?? EXTENSION_REMEDY

    return {
      Identifier(rawNode): void {
        // rawNode: any — Rule.RuleListener types all visitor params as any via index signature
        const name: string = rawNode.name
        if (!RAW_STORAGE_APIS.has(name)) return
        if (allowlist.has(name)) return

        const parent = rawNode.parent

        // A property: reported only as a global's (`window.localStorage`),
        // never as another object's (`deps.localStorage`).
        if (
          parent.type === "MemberExpression" &&
          !parent.computed &&
          parent.property === rawNode &&
          !(
            parent.object.type === "Identifier" &&
            GLOBALS.has(parent.object.name)
          )
        )
          return

        // An object's key names nothing to read.
        if (parent.type === "Property" && parent.key === rawNode) return

        context.report({
          node: rawNode,
          messageId: "rawStorage",
          data: { name, remedy },
        })
      },
    }
  },
}
