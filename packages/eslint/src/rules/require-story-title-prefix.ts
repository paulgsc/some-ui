import type { Rule } from "eslint"

// Unlike the single-visitor rules elsewhere in this package, this rule needs
// to correlate two visitors (the `const meta = {...}` declaration and the
// later `export default meta`), so ESTree nodes get stored and passed across
// visitor callbacks instead of only ever being read off one implicitly-any
// visitor param in place. `any` here plays the same role as the "rawNode:
// any" convention documented in the other rules in this directory.
/* eslint-disable @typescript-eslint/no-explicit-any -- cross-visitor ESTree node storage, see comment above */

export const requireStoryTitlePrefix: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        'Require Storybook meta.title to start with a configured prefix (e.g. "Extensions/") so title-based tooling — like the UnoCSS-scoping decorator in .storybook/unocss-decorator.tsx — can rely on it.',
    },
    schema: [
      {
        type: "object",
        properties: {
          prefix: { type: "string", minLength: 1 },
        },
        required: ["prefix"],
        additionalProperties: false,
      },
    ],
    messages: {
      missingTitle:
        'Storybook meta is missing a "title" property. It must start with "{{prefix}}" (e.g. "{{prefix}}ComponentName").',
      wrongPrefix: 'Storybook title "{{value}}" must start with "{{prefix}}".',
    },
  },
  create(context) {
    // context.options is any[] per @types/eslint; no-unsafe-assignment is intentionally off
    const prefix: string = context.options[0]?.prefix ?? ""
    if (!prefix) return {}

    // Top-level `const meta = {...}` declarations, keyed by name, so a later
    // `export default meta` can be resolved back to its object literal.
    const topLevelObjects = new Map<string, any>()

    function checkMetaObject(objectExpression: any, node: any): void {
      const titleProp = objectExpression.properties.find(
        (prop: any) =>
          prop.type === "Property" &&
          !prop.computed &&
          ((prop.key.type === "Identifier" && prop.key.name === "title") ||
            (prop.key.type === "Literal" && prop.key.value === "title"))
      )

      if (!titleProp) {
        context.report({ node, messageId: "missingTitle", data: { prefix } })
        return
      }

      const value = titleProp.value
      if (value.type === "Literal" && typeof value.value === "string") {
        const titleValue: string = value.value
        if (!titleValue.startsWith(prefix)) {
          context.report({
            node: titleProp,
            messageId: "wrongPrefix",
            data: { value: titleValue, prefix },
          })
        }
      }
    }

    return {
      VariableDeclarator(rawNode): void {
        if (
          rawNode.id.type === "Identifier" &&
          rawNode.init?.type === "ObjectExpression"
        ) {
          topLevelObjects.set(String(rawNode.id.name), rawNode.init)
        }
      },

      ExportDefaultDeclaration(rawNode): void {
        const declaration = rawNode.declaration

        if (declaration.type === "ObjectExpression") {
          checkMetaObject(declaration, rawNode)
          return
        }

        if (declaration.type === "Identifier") {
          const resolved = topLevelObjects.get(String(declaration.name))
          if (resolved) checkMetaObject(resolved, rawNode)
        }
      },
    }
  },
}
