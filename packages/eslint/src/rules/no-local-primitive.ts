import type { Rule } from "eslint"
import type * as ESTree from "estree"

/**
 * U4 (#2112): a small primitive the repo owns once (`assertNever`,
 * `isRecord`) is imported from its owner, never defined again beside the
 * code that needs it. The `owners` option maps each name to the files
 * allowed to define it, as path suffixes; a function declaration, or a
 * `const` bound to a function, with that name anywhere else is reported.
 */
export const noLocalPrimitive: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid defining a primitive the repo already owns; import it from its owner instead",
    },
    schema: [
      {
        type: "object",
        properties: {
          owners: {
            type: "object",
            additionalProperties: { type: "array", items: { type: "string" } },
          },
        },
        required: ["owners"],
        additionalProperties: false,
      },
    ],
    messages: {
      localPrimitive:
        "`{{name}}` has an owner ({{owners}}). Import it from there instead of defining another copy.",
    },
  },
  create(context) {
    // context.options is any[] per @types/eslint; no-unsafe-assignment is off
    const option: Record<string, ReadonlyArray<string>> = context.options[0]
      ?.owners ?? {}
    // A Map, so `toString` or `hasOwnProperty` never reads the prototype's.
    const owners = new Map(Object.entries(option))
    const filename = context.filename.replaceAll("\\", "/")

    function check(node: Rule.Node, name: string): void {
      const allowed = owners.get(name)
      if (allowed === undefined) return
      if (allowed.some((suffix) => filename.endsWith(suffix))) return
      context.report({
        node,
        messageId: "localPrimitive",
        data: { name, owners: allowed.join(", ") },
      })
    }

    return {
      // `[id]`: an anonymous `export default function` has none at runtime.
      "FunctionDeclaration[id]"(
        node: ESTree.FunctionDeclaration & Rule.Node
      ): void {
        check(node, node.id.name)
      },
      VariableDeclarator(node): void {
        const init = node.init?.type
        if (
          node.id.type === "Identifier" &&
          (init === "ArrowFunctionExpression" || init === "FunctionExpression")
        )
          check(node, node.id.name)
      },
    }
  },
}
