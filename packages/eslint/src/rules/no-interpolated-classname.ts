import type { Rule } from "eslint"

const DEFAULT_ATTRIBUTE_NAMES = ["className", "class"]
const DEFAULT_CALLEE_NAMES = [
  "cn",
  "clsx",
  "classNames",
  "classnames",
  "cva",
  "twMerge",
  "twJoin",
]
// "language-${language}" (syntax-highlighter token classes, e.g.
// packages/ui/input's code-display component) isn't a Tailwind utility —
// content-scanning it doing nothing is fine, so it's exempt by default.
const DEFAULT_IGNORE = ["language-"]

function endsWithNonWhitespace(text: string): boolean {
  return text.length > 0 && !/\s$/.test(text)
}

function startsWithNonWhitespace(text: string): boolean {
  return text.length > 0 && !/^\s/.test(text)
}

function isIgnored(fragment: string, ignore: Array<string>): boolean {
  return ignore.some((needle) => fragment.includes(needle))
}

// rawNode/parts: any — ESTree shapes not modeled precisely by @types/eslint's
// Node union; same "rawNode: any" convention documented in the other rules
// in this directory (no-unsafe-* is off repo-wide for this reason).
/* eslint-disable @typescript-eslint/no-explicit-any -- see comment above */

function flattenPlusChain(node: any): Array<any> {
  if (node.type === "BinaryExpression" && node.operator === "+") {
    // Bind to an explicitly-typed local before returning — an inline
    // `return [...spread]` infers as `any[]` at the return site regardless
    // of this function's declared return type, and no-unsafe-return checks
    // the return *expression's* type, not the declared one.
    const flattened: Array<any> = [
      ...flattenPlusChain(node.left),
      ...flattenPlusChain(node.right),
    ]
    return flattened
  }
  const single: Array<any> = [node]
  return single
}

function staticText(node: any): string | undefined {
  if (node.type === "Literal" && typeof node.value === "string") {
    // typeof-narrowing an `any` property access doesn't change its static
    // type — an explicit local annotation is what makes it a real `string`.
    const value: string = node.value
    return value
  }
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    const cooked: string =
      node.quasis[0]?.value.cooked ?? node.quasis[0]?.value.raw ?? ""
    return cooked
  }
  return undefined
}

function findEnclosingScope(
  rawNode: any,
  attributeNames: Array<string>,
  calleeNames: Array<string>
): string | null {
  let current = rawNode.parent
  while (current) {
    if (
      current.type === "JSXAttribute" &&
      current.name?.type === "JSXIdentifier"
    ) {
      const name: string = current.name.name
      if (attributeNames.includes(name)) {
        return `the "${name}" attribute`
      }
    }
    if (
      current.type === "CallExpression" &&
      current.callee?.type === "Identifier"
    ) {
      const name: string = current.callee.name
      if (calleeNames.includes(name)) {
        return `a "${name}(...)" call`
      }
    }
    current = current.parent
  }
  return null
}

export const noInterpolatedClassname: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid assembling a class name from a runtime expression fused onto literal text (e.g. `bg-${color}-500`) inside className/class attributes or classname-merging calls (cn, clsx, cva, ...). A single-pass content scan can only see complete literal strings, so a class assembled at runtime silently drops out of the compiled CSS unless the same string also appears verbatim elsewhere. Select between complete literal strings (ternary/lookup table), or thread the dynamic value through a CSS custom property consumed by a static arbitrary-value utility instead.",
    },
    schema: [
      {
        type: "object",
        properties: {
          attributeNames: { type: "array", items: { type: "string" } },
          calleeNames: { type: "array", items: { type: "string" } },
          ignore: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      interpolatedClassname:
        'Dynamic expression is fused directly onto literal text ("{{fragment}}") inside {{scope}}. A single-pass content scan only sees complete literal class strings, so this variant won\'t exist in the compiled CSS. Use a complete literal string per branch (ternary/lookup table), or thread the dynamic value through a CSS custom property (style={{"--x": value}}) consumed by a static arbitrary-value utility — see packages/ui/dice-card.',
      interpolatedClassnameConcat:
        "String concatenation builds a class name fragment inside {{scope}}. A single-pass content scan only sees complete literal class strings, so this variant won't exist in the compiled CSS. Use a complete literal string per branch (ternary/lookup table), or thread the dynamic value through a CSS custom property consumed by a static arbitrary-value utility instead.",
    },
  },
  create(context) {
    // context.options is any[] per @types/eslint; no-unsafe-assignment is intentionally off
    const options = context.options[0] ?? {}
    const attributeNames: Array<string> =
      options.attributeNames ?? DEFAULT_ATTRIBUTE_NAMES
    const calleeNames: Array<string> =
      options.calleeNames ?? DEFAULT_CALLEE_NAMES
    const ignore: Array<string> = options.ignore ?? DEFAULT_IGNORE

    return {
      // rawNode: any — Rule.RuleListener types all visitor params as any via index signature
      TemplateLiteral(rawNode: any): void {
        const scope = findEnclosingScope(rawNode, attributeNames, calleeNames)
        if (!scope) return

        const { expressions, quasis } = rawNode
        for (let i = 0; i < expressions.length; i++) {
          const before: string = quasis[i]?.value.raw ?? ""
          const after: string = quasis[i + 1]?.value.raw ?? ""
          const fusedBefore = endsWithNonWhitespace(before)
          const fusedAfter = startsWithNonWhitespace(after)
          if (!fusedBefore && !fusedAfter) continue

          const fragment = `${before}\${…}${after}`
          if (isIgnored(fragment, ignore)) continue

          context.report({
            node: expressions[i],
            messageId: "interpolatedClassname",
            data: { fragment, scope },
          })
        }
      },

      BinaryExpression(rawNode: any): void {
        if (rawNode.operator !== "+") return
        // Only inspect the outermost `+` of a chain — the inner nodes of the
        // same chain are BinaryExpressions too and would otherwise duplicate
        // the report.
        if (
          rawNode.parent?.type === "BinaryExpression" &&
          rawNode.parent.operator === "+"
        )
          return

        const scope = findEnclosingScope(rawNode, attributeNames, calleeNames)
        if (!scope) return

        const parts = flattenPlusChain(rawNode)
        for (let i = 0; i < parts.length - 1; i++) {
          const leftText = staticText(parts[i])
          const rightText = staticText(parts[i + 1])

          const fused =
            (leftText !== undefined &&
              rightText === undefined &&
              endsWithNonWhitespace(leftText) &&
              !isIgnored(leftText, ignore)) ||
            (leftText === undefined &&
              rightText !== undefined &&
              startsWithNonWhitespace(rightText) &&
              !isIgnored(rightText, ignore))

          if (fused) {
            context.report({
              node: rawNode,
              messageId: "interpolatedClassnameConcat",
              data: { scope },
            })
            return
          }
        }
      },
    }
  },
}
