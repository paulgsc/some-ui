import type { Rule } from "eslint"

export const noUnprefixedNamespace: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce per-workspace prefix on CSS classes, data-* attributes, and CustomEvent names (Good-Citizen Charter §4)",
    },
    schema: [
      {
        type: "object",
        properties: {
          prefix: { type: "string", minLength: 1 },
          allowlist: { type: "array", items: { type: "string" } },
        },
        required: ["prefix"],
        additionalProperties: false,
      },
    ],
    messages: {
      noCssPrefix:
        'CSS class "{{value}}" must start with workspace prefix "{{prefix}}".',
      noDataPrefix:
        'data-* attribute "{{value}}" must start with "data-{{prefix}}".',
      noEventPrefix:
        'CustomEvent name "{{value}}" must start with workspace prefix "{{prefix}}".',
    },
  },
  create(context) {
    // context.options is any[] per @types/eslint; no-unsafe-assignment is intentionally off
    const prefix: string = context.options[0]?.prefix ?? ""
    const allowlistArr: Array<string> = context.options[0]?.allowlist ?? []

    if (!prefix) return {}

    function isAllowed(value: string): boolean {
      return allowlistArr.includes(value)
    }

    return {
      CallExpression(rawNode): void {
        // rawNode: any — Rule.RuleListener types all visitor params as any via index signature
        const callee = rawNode.callee

        // classList.add/remove/contains/toggle('class-name')
        if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.object.type === "MemberExpression"
        ) {
          const outerObj = callee.object
          if (
            !outerObj.computed &&
            outerObj.property.type === "Identifier" &&
            outerObj.property.name === "classList" &&
            callee.property.type === "Identifier" &&
            ["add", "remove", "contains", "toggle"].includes(
              String(callee.property.name)
            )
          ) {
            for (const arg of rawNode.arguments) {
              // arg is Expression | SpreadElement from iteration (non-null); .type narrows to Literal
              if (arg.type === "Literal" && typeof arg.value === "string") {
                const val = arg.value
                if (!isAllowed(val) && !val.startsWith(prefix)) {
                  context.report({
                    node: rawNode,
                    messageId: "noCssPrefix",
                    data: { value: val, prefix },
                  })
                }
              }
            }
            return
          }
        }

        // element.setAttribute('data-something', value)
        if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.property.type === "Identifier" &&
          callee.property.name === "setAttribute" &&
          rawNode.arguments.length >= 1
        ) {
          // arguments[0] can be undefined (noUncheckedIndexedAccess); ?. narrows away undefined
          const attrArg = rawNode.arguments[0]
          if (
            attrArg?.type === "Literal" &&
            typeof attrArg.value === "string" &&
            attrArg.value.startsWith("data-")
          ) {
            const attrName = attrArg.value
            if (
              !isAllowed(attrName) &&
              !attrName.startsWith(`data-${prefix}`)
            ) {
              context.report({
                node: rawNode,
                messageId: "noDataPrefix",
                data: { value: attrName, prefix },
              })
            }
          }
        }
      },

      NewExpression(rawNode): void {
        // rawNode: any — Rule.RuleListener types all visitor params as any via index signature
        // new CustomEvent('event-name')
        if (
          rawNode.callee.type === "Identifier" &&
          rawNode.callee.name === "CustomEvent" &&
          rawNode.arguments.length >= 1
        ) {
          // arguments[0] can be undefined (noUncheckedIndexedAccess); ?. narrows away undefined
          const nameArg = rawNode.arguments[0]
          if (
            nameArg?.type === "Literal" &&
            typeof nameArg.value === "string"
          ) {
            const eventName = nameArg.value
            if (!isAllowed(eventName) && !eventName.startsWith(prefix)) {
              context.report({
                node: rawNode,
                messageId: "noEventPrefix",
                data: { value: eventName, prefix },
              })
            }
          }
        }
      },
    }
  },
}
