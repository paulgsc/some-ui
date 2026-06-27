import type { Rule } from "eslint"

export const noZindexEscalation: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban raw z-index literals at or above the escalation threshold; use the shared Z_INDEX_POLICY constant instead (Good-Citizen Charter §6)",
    },
    schema: [
      {
        type: "object",
        properties: {
          threshold: { type: "number" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      zIndexTooHigh:
        "z-index value {{value}} is at or above the escalation threshold ({{threshold}}). Use Z_INDEX_POLICY from @some-extension/common instead.",
    },
  },
  create(context) {
    // context.options is any[] per @types/eslint; no-unsafe-assignment is intentionally off
    const rawThreshold = context.options[0]?.threshold
    const threshold =
      typeof rawThreshold === "number" ? rawThreshold : 2147483647

    function checkNumericZIndex(raw: number | string, node: Rule.Node): void {
      const n = typeof raw === "string" ? parseInt(raw, 10) : raw
      if (!isNaN(n) && n >= threshold) {
        context.report({
          node,
          messageId: "zIndexTooHigh",
          data: { value: String(n), threshold: String(threshold) },
        })
      }
    }

    return {
      // { zIndex: 2147483647 } or { 'z-index': 2147483647 }
      Property(rawNode): void {
        // rawNode: any — Rule.RuleListener types all visitor params as any via index signature
        const key = rawNode.key
        let keyName: string | null = null
        if (key.type === "Identifier") {
          keyName = String(key.name)
        } else if (key.type === "Literal" && typeof key.value === "string") {
          keyName = key.value
        }

        if (keyName !== "zIndex" && keyName !== "z-index") return

        const val = rawNode.value
        if (val.type === "Literal") {
          // no-unsafe-assignment is intentionally off; typeof narrows any → concrete type
          const node: Rule.Node = rawNode
          if (typeof val.value === "number") checkNumericZIndex(val.value, node)
          else if (typeof val.value === "string")
            checkNumericZIndex(val.value, node)
        }
      },

      // element.style.zIndex = '2147483647'  or  el.style.zIndex = 2147483647
      AssignmentExpression(rawNode): void {
        // rawNode: any — Rule.RuleListener types all visitor params as any via index signature
        const left = rawNode.left
        if (
          left.type === "MemberExpression" &&
          !left.computed &&
          left.property.type === "Identifier" &&
          left.property.name === "zIndex"
        ) {
          const val = rawNode.right
          if (val.type === "Literal") {
            const node: Rule.Node = rawNode
            if (typeof val.value === "number")
              checkNumericZIndex(val.value, node)
            else if (typeof val.value === "string")
              checkNumericZIndex(val.value, node)
          }
        }
      },
    }
  },
}
