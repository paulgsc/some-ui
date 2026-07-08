import type { Rule } from "eslint"

// SwitchStatement/SwitchCase shapes (discriminant, cases[], test, consequent)
// aren't narrowed cleanly through @types/eslint's Node union across nested
// `.type` checks, so this rule reads several values as `any`. `any` here
// plays the same role as the "rawNode: any" convention documented in the
// other rules in this directory.
/* eslint-disable @typescript-eslint/no-explicit-any -- ESTree shapes not modeled precisely by @types/eslint's Node union, see comment above */

const DEFAULT_HELPER_NAMES: ReadonlyArray<string> = [
  "assertNever",
  "assertUnreachable",
  "unreachable",
]

function isHelperCall(expr: any, helperNames: Set<string>): boolean {
  return (
    expr?.type === "CallExpression" &&
    expr.callee.type === "Identifier" &&
    helperNames.has(String(expr.callee.name))
  )
}

// Unwraps a single `{ ... }` default body (as require-case-braces produces)
// down to its statements, and drops trailing `break`s: `return assertNever(x)`
// and `return assertNever(x); break` are both fail-fast — the break is just
// unreachable defensive habit some codebases keep after a `never`-typed call.
function meaningfulBody(consequent: Array<any>): Array<any> {
  let body = consequent
  if (body.length === 1 && body[0].type === "BlockStatement") {
    body = body[0].body
  }
  while (body.length > 0 && body[body.length - 1].type === "BreakStatement") {
    body = body.slice(0, -1)
  }
  return body
}

export const requireFailFastDefault: Rule.RuleModule = {
  meta: {
    type: "problem",
    // Not autofixable: a fix would have to invent a project-specific "assert
    // never" helper (import path, name, error shape) that this rule has no
    // way to know. Contrast require-case-braces, which is a pure syntactic
    // transform and does autofix.
    docs: {
      description:
        "Require a switch statement's default case to fail fast (`return assertNever(x)` / `throw ...`) instead of silently falling through (`break`, bare `return`, logging). Pairs with a `never`-typed parameter for compile-time exhaustiveness: forgetting to add a case for a new union member now fails both the type checker and, until that's fixed, the runtime.",
    },
    schema: [
      {
        type: "object",
        properties: {
          helperNames: {
            type: "array",
            items: { type: "string", minLength: 1 },
            minItems: 1,
          },
          requireDefault: { type: "boolean" },
          requireDiscriminantArgument: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingDefault:
        "Switch is missing a default case. Add `default: return {{helper}}({{discriminant}})` so a value outside the handled cases fails at runtime instead of silently passing through.",
      invalidDefaultBody:
        "Default case must fail fast — `return {{helpers}}(...)` or `throw ...` — not `{{found}}`. A default that returns/breaks/logs silently hides bugs when a new case is added and this default is forgotten.",
      wrongArgument:
        "`{{helper}}(...)` should be called with the switch discriminant `{{discriminant}}`, not `{{got}}`.",
    },
  },
  create(context) {
    // context.options is any[] per @types/eslint; no-unsafe-assignment is intentionally off
    const optionHelperNames: Array<string> | undefined =
      context.options[0]?.helperNames
    const helperNamesList: Array<string> = optionHelperNames ?? [
      ...DEFAULT_HELPER_NAMES,
    ]
    const helperNames = new Set<string>(helperNamesList)
    const requireDefault: boolean = context.options[0]?.requireDefault ?? true
    const requireDiscriminantArgument: boolean =
      context.options[0]?.requireDiscriminantArgument ?? true
    const sourceCode = context.sourceCode
    const helperList = helperNamesList.join("/")
    const firstHelperName = helperNamesList[0] ?? "assertNever"

    return {
      // rawNode: any — Rule.RuleListener types all visitor params as any via index signature
      SwitchStatement(rawNode): void {
        const node = rawNode
        const discriminantText = sourceCode.getText(node.discriminant)
        const defaultCase = node.cases.find(
          (switchCase: any) => switchCase.test === null
        )

        function checkArgument(call: any): void {
          if (!requireDiscriminantArgument) return
          const arg = call.arguments[0]
          let argText = "()"
          if (arg) {
            const argNode: Rule.Node = arg
            argText = sourceCode.getText(argNode)
          }
          if (argText !== discriminantText) {
            context.report({
              node: call,
              messageId: "wrongArgument",
              data: {
                helper: String(call.callee.name),
                discriminant: discriminantText,
                got: argText,
              },
            })
          }
        }

        if (!defaultCase) {
          if (requireDefault) {
            context.report({
              node,
              messageId: "missingDefault",
              data: {
                helper: firstHelperName,
                discriminant: discriminantText,
              },
            })
          }
          return
        }

        const body = meaningfulBody(defaultCase.consequent)
        const last: any = body[body.length - 1]

        if (last?.type === "ThrowStatement") return

        if (
          last?.type === "ReturnStatement" &&
          isHelperCall(last.argument, helperNames)
        ) {
          checkArgument(last.argument)
          return
        }

        if (
          last?.type === "ExpressionStatement" &&
          isHelperCall(last.expression, helperNames)
        ) {
          checkArgument(last.expression)
          return
        }

        let found = "an empty default"
        if (last !== undefined) {
          const lastNode: Rule.Node = last
          found = sourceCode.getText(lastNode).slice(0, 60)
        }

        context.report({
          node: defaultCase,
          messageId: "invalidDefaultBody",
          data: { helpers: helperList, found },
        })
      },
    }
  },
}
