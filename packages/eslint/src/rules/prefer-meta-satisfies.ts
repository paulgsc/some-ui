import type { Rule } from "eslint"

// Unlike the single-visitor rules elsewhere in this package, this rule reads
// TSAsExpression/TSTypeAssertion nodes that @types/eslint's Node union does
// not model, and splices replacement source text via the fixer. `any` here
// plays the same role as the "rawNode: any" convention documented in the
// other rules in this directory.
/* eslint-disable @typescript-eslint/no-explicit-any -- ESTree nodes outside @types/eslint's Node union, see comment above */

const DEFAULT_TYPE_NAMES: ReadonlyArray<string> = ["Meta"]
const DEFAULT_VARIABLE_NAME = "meta"

function getAssertedTypeName(typeAnnotation: any): string | null {
  if (
    typeAnnotation.type === "TSTypeReference" &&
    typeAnnotation.typeName.type === "Identifier"
  ) {
    return String(typeAnnotation.typeName.name)
  }
  return null
}

// Picks a binding name that doesn't collide with an existing top-level
// `const`/`let`/`var` in the file, so the fix never shadows a real variable.
function findFreeVariableName(
  programBody: Array<any>,
  preferred: string
): string {
  const taken = new Set<string>()
  for (const statement of programBody) {
    if (statement.type !== "VariableDeclaration") continue
    for (const declarator of statement.declarations) {
      if (declarator.id.type === "Identifier") {
        taken.add(String(declarator.id.name))
      }
    }
  }

  if (!taken.has(preferred)) return preferred
  let suffix = 2
  while (taken.has(`${preferred}${suffix}`)) suffix += 1
  return `${preferred}${suffix}`
}

export const preferMetaSatisfies: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: {
      description:
        'Autofix `export default { ... } as Meta` to `const meta = { ... } satisfies Meta` + `export default meta`, so Storybook default-export meta objects satisfy @typescript-eslint/consistent-type-assertions (assertionStyle: "never") without losing type inference.',
    },
    schema: [
      {
        type: "object",
        properties: {
          typeNames: {
            type: "array",
            items: { type: "string", minLength: 1 },
            minItems: 1,
          },
          variableName: { type: "string", minLength: 1 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferSatisfies:
        "Storybook default export uses `as {{typeName}}`. Assign it to a `{{variableName}}` variable with `satisfies {{typeName}}` instead — autofixable.",
    },
  },
  create(context) {
    // context.options is any[] per @types/eslint; no-unsafe-assignment is intentionally off
    const optionTypeNames: Array<string> | undefined =
      context.options[0]?.typeNames
    const typeNames = new Set<string>(optionTypeNames ?? DEFAULT_TYPE_NAMES)
    const preferredVariableName: string =
      context.options[0]?.variableName ?? DEFAULT_VARIABLE_NAME
    const sourceCode = context.sourceCode

    return {
      // rawNode: any — ExportDefaultDeclaration.declaration is typed against
      // @types/estree's Expression union, which has no TSAsExpression /
      // TSTypeAssertion members; those are @typescript-eslint/parser-only nodes.
      ExportDefaultDeclaration(rawNode: any): void {
        const declaration = rawNode.declaration
        const isAssertion =
          declaration.type === "TSAsExpression" ||
          declaration.type === "TSTypeAssertion"
        if (!isAssertion) return

        const expression: Rule.Node = declaration.expression
        if (expression.type !== "ObjectExpression") return

        const typeAnnotation: Rule.Node = declaration.typeAnnotation
        const typeName = getAssertedTypeName(typeAnnotation)
        if (typeName === null || !typeNames.has(typeName)) return

        context.report({
          node: rawNode,
          messageId: "preferSatisfies",
          data: { variableName: preferredVariableName, typeName },
          fix(fixer) {
            const programBody: Array<any> = rawNode.parent.body
            const variableName = findFreeVariableName(
              programBody,
              preferredVariableName
            )
            const objectText = sourceCode.getText(expression)
            const typeText = sourceCode.getText(typeAnnotation)

            return fixer.replaceText(
              rawNode,
              `const ${variableName} = ${objectText} satisfies ${typeText}\n\nexport default ${variableName}`
            )
          },
        })
      },
    }
  },
}
