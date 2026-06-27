import type { Rule } from "eslint"

const BANNED_GLOBALS = new Set(["document", "browser", "chrome"])

export const noLogicLayerSideEffects: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid DOM/browser API globals (document, browser, chrome) inside logic-layer files. Apply via the `files` glob in each workspace's eslint.config.js (Good-Citizen Charter §2)",
    },
    schema: [],
    messages: {
      bannedGlobal:
        'Logic layer must not reference "{{name}}". Inject DOM/browser effects through the presentation/effects boundary instead.',
    },
  },
  create(context) {
    return {
      Identifier(rawNode): void {
        // rawNode: any — Rule.RuleListener types all visitor params as any via index signature
        const name: string = rawNode.name
        if (!BANNED_GLOBALS.has(name)) return

        const parent = rawNode.parent

        // Skip: used as property key on a member expression (x.document)
        if (
          parent.type === "MemberExpression" &&
          !parent.computed &&
          parent.property === rawNode
        )
          return

        // Skip: import/export specifiers
        if (
          parent.type === "ImportSpecifier" ||
          parent.type === "ImportDefaultSpecifier" ||
          parent.type === "ExportSpecifier"
        )
          return

        context.report({
          node: rawNode,
          messageId: "bannedGlobal",
          data: { name },
        })
      },
    }
  },
}
