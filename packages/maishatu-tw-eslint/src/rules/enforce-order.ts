import type { TSESLint, TSESTree } from "@typescript-eslint/utils"
import { AST_NODE_TYPES, AST_TOKEN_TYPES } from "@typescript-eslint/utils"
import type * as ts from "typescript"

import {
  createRule,
  getConstrainedTypeAtLocation,
  getParserServices,
} from "../util"

export type MessageId = "noArrayDelete" | "useSplice"

export default createRule<[], MessageId>({
  name: "no-array-delete",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow using the `delete` operator on array values",
      recommended: "recommended",
      requiresTypeChecking: true,
    },
    hasSuggestions: true,
    messages: {
      noArrayDelete:
        "Using the `delete` operator with an array expression is unsafe.",
      useSplice: "Use `array.splice()` instead.",
    },
    schema: [
      {
        type: "object",
        properties: {
          callees: {
            type: "array",
            items: { type: "string", minLength: 0 },
            uniqueItems: true,
          },
          ignoredKeys: {
            type: "array",
            items: { type: "string", minLength: 0 },
            uniqueItems: true,
          },
          config: {
            // returned from `loadConfig()` utility
            type: ["string", "object"],
          },
          removeDuplicates: {
            // default: true,
            type: "boolean",
          },
          tags: {
            type: "array",
            items: { type: "string", minLength: 0 },
            uniqueItems: true,
          },
        },
      },
    ],
  },
  defaultOptions: [
    {
      callees: [],
      ignoredKeys: [],
      removeDuplicates: true,
      tags: [],
      skipClassAttribute: false,
    },
  ],

  create(context: TSESLint.RuleContext<MessageId, []>) {
    function sortNodeArgumentValue(
      node: TSESTree.Node,
      arg: TSESTree.Node | null = null
    ): void {
      let originalClassNamesValue: string | null = null
      let start: number | null = null
      let end: number | null = null
      let prefix = ""
      let suffix = ""

      if (arg === null) {
        originalClassNamesValue = astUtil.extractValueFromNode(node)
        const range = astUtil.extractRangeFromNode(node)
        if (node.type === AST_NODE_TYPES.JSXAttribute) {
          start = range[0]
          end = range[1]
        } else {
          start = range[0] + 1
          end = range[1] - 1
        }
      } else {
        switch (arg.type) {
          case AST_NODE_TYPES.Identifier:
            return
          case AST_NODE_TYPES.TemplateLiteral:
            arg.expressions.forEach((exp) => {
              sortNodeArgumentValue(node, exp)
            })
            arg.quasis.forEach((quasis) => {
              sortNodeArgumentValue(node, quasis)
            })
            return
          case AST_NODE_TYPES.ConditionalExpression:
            sortNodeArgumentValue(node, arg.consequent)
            sortNodeArgumentValue(node, arg.alternate)
            return
          case AST_NODE_TYPES.LogicalExpression:
            sortNodeArgumentValue(node, arg.right)
            return
          case AST_NODE_TYPES.ArrayExpression:
            arg.elements.forEach((el) => {
              if (el) sortNodeArgumentValue(node, el)
            })
            return
          case AST_NODE_TYPES.ObjectExpression:
            arg.properties.forEach((prop) => {
              if (TSESTree.isProperty(prop)) {
                sortNodeArgumentValue(node, prop.value)
              }
            })
            return
          case AST_NODE_TYPES.Literal:
            originalClassNamesValue = String(arg.value)
            start = arg.range[0] + 1
            end = arg.range[1] - 1
            break
          case AST_NODE_TYPES.TemplateElement:
            originalClassNamesValue = arg.value.raw
            if (originalClassNamesValue === "") {
              return
            }
            start = arg.range[0]
            end = arg.range[1]
            const txt = context.getSourceCode().getText(arg)
            prefix = astUtil.getTemplateElementPrefix(
              txt,
              originalClassNamesValue
            )
            suffix = astUtil.getTemplateElementSuffix(
              txt,
              originalClassNamesValue
            )
            originalClassNamesValue = astUtil.getTemplateElementBody(
              txt,
              prefix,
              suffix
            )
            break
        }
      }

      if (!originalClassNamesValue || !start || !end) {
        return
      }

      const { classNames, whitespaces, headSpace, tailSpace } =
        astUtil.extractClassnamesFromValue(originalClassNamesValue)

      if (classNames.length <= 1) {
        return
      }

      let orderedClassNames = order(classNames, contextFallback).split(" ")

      if (options.removeDuplicates) {
        removeDuplicatesFromClassnamesAndWhitespaces(
          orderedClassNames,
          whitespaces,
          headSpace,
          tailSpace
        )
      }

      let validatedClassNamesValue = ""
      for (let i = 0; i < orderedClassNames.length; i++) {
        const w = whitespaces[i] ?? ""
        const cls = orderedClassNames[i]
        validatedClassNamesValue += headSpace ? `${w}${cls}` : `${cls}${w}`
        if (headSpace && tailSpace && i === orderedClassNames.length - 1) {
          validatedClassNamesValue += whitespaces[whitespaces.length - 1] ?? ""
        }
      }

      if (originalClassNamesValue !== validatedClassNamesValue) {
        validatedClassNamesValue = prefix + validatedClassNamesValue + suffix
        context.report({
          node: node,
          messageId: "invalidOrder",
          fix(fixer) {
            return fixer.replaceTextRange(
              [start, end],
              validatedClassNamesValue
            )
          },
        })
      }
    }

    return {
      JSXAttribute(node: TSESTree.JSXAttribute): void {
        if (
          !astUtil.isClassAttribute(node, options.classRegex) ||
          options.skipClassAttribute
        ) {
          return
        }

        if (node.value && TSESTree.isLiteral(node.value)) {
          sortNodeArgumentValue(node)
        } else if (
          node.value &&
          node.value.type === AST_NODE_TYPES.JSXExpressionContainer
        ) {
          sortNodeArgumentValue(node, node.value.expression)
        }
      },

      CallExpression(node: TSESTree.CallExpression): void {
        const calleeStr = astUtil.calleeToString(node.callee)
        if (!options.callees?.includes(calleeStr)) {
          return
        }

        node.arguments.forEach((arg) => {
          sortNodeArgumentValue(node, arg)
        })
      },

      TaggedTemplateExpression(node: TSESTree.TaggedTemplateExpression): void {
        const tagName = TSESTree.isIdentifier(node.tag)
          ? node.tag.name
          : TSESTree.isMemberExpression(node.tag) &&
              TSESTree.isIdentifier(node.tag.object)
            ? node.tag.object.name
            : undefined

        if (!tagName || !options.tags?.includes(tagName)) {
          return
        }

        sortNodeArgumentValue(node, node.quasi)
      },
    }
  },
})
