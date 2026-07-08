import type { Rule } from "eslint"

// SwitchCase.consequent/.test shapes aren't narrowed cleanly through
// @types/eslint's Node union across this visitor, so this rule reads them as
// `any` and narrows by `.type`. `any` here plays the same role as the
// "rawNode: any" convention documented in the other rules in this directory.
/* eslint-disable @typescript-eslint/no-explicit-any -- ESTree shapes not modeled precisely by @types/eslint's Node union, see comment above */

export const requireCaseBraces: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: {
      description:
        "Require each non-empty switch case/default body to be wrapped in its own block statement `{ ... }` — autofixable. Bare case bodies all share one lexical scope, so a `let`/`const` declared in one arm can collide with, or leak into, a sibling arm.",
    },
    schema: [],
    messages: {
      requireBraces:
        "Wrap this case body in braces: `{{prefix}}: { ... }`. A bare case body shares scope with every other arm in the switch.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode

    return {
      // rawNode: any — SwitchCase's real ESTree type has an optional/nullable
      // `.loc`, which the fixer below needs to read unconditionally.
      SwitchCase(rawNode: any): void {
        const node = rawNode
        const consequent: Array<any> = node.consequent

        if (consequent.length === 0) return // fallthrough label, nothing to wrap
        if (consequent.length === 1 && consequent[0].type === "BlockStatement")
          return // already braced

        const testNode: Rule.Node | null = node.test
        const prefix: string = testNode
          ? `case ${sourceCode.getText(testNode)}`
          : "default"

        context.report({
          node,
          messageId: "requireBraces",
          data: { prefix },
          fix(fixer) {
            const first: Rule.Node = consequent[0]
            const last: Rule.Node = consequent[consequent.length - 1]
            const colon = sourceCode.getTokenBefore(first)
            if (!colon) return null

            const column: number = node.loc.start.column
            const indent = " ".repeat(column)
            return [
              fixer.insertTextAfter(colon, " {"),
              fixer.insertTextAfter(last, `\n${indent}}`),
            ]
          },
        })
      },
    }
  },
}
