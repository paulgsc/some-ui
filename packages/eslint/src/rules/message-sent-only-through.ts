import type { Rule } from "eslint"

import { isKeyOrType, staticText, stringOption } from "./ast-names.js"

const COMPARISONS: ReadonlySet<string> = new Set(["===", "!==", "==", "!="])

/**
 * Invariant LP2 in extensions/some-drama's README ("Live playback"): one
 * message type is sent only through one publisher. Configured with the
 * message's `type` string and the publisher's name, it reports that string
 * as a value anywhere except inside the arguments of a call to the
 * publisher. The places that name the type without sending it pass:
 *
 *   - a key or a type position (`type: "LIVE_PLAYBACK"` in a type alias);
 *   - an operand of `===`, `!==`, `==` or `!=`, and a `case` label (a guard
 *     that reads a received message).
 *
 * So a constant or a helper elsewhere that builds the message, each of which
 * needs the string as a value, is reported. Whether `background.ts` routes
 * every send through the publisher's call is still LP2's reading.
 */
export const messageSentOnlyThrough: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Build a given message type only inside its publisher's call (some-drama invariant LP2)",
    },
    schema: [
      {
        type: "object",
        properties: {
          type: { type: "string", minLength: 1 },
          through: { type: "string", minLength: 1 },
        },
        required: ["type", "through"],
        additionalProperties: false,
      },
    ],
    messages: {
      stray:
        '"{{type}}" is sent only through `{{through}}(`: build the message inside that call, or compare against the string to read one (some-drama README, LP2).',
    },
  },
  create(context) {
    // The schema guarantees both strings; read them without an assertion.
    const options: unknown = context.options[0]
    const type = stringOption(options, "type")
    const through = stringOption(options, "through")
    if (type === null || through === null) return {}
    const check = (node: Rule.Node): void => {
      if (isRead(node) || insideCallTo(node, through)) return
      context.report({ node, messageId: "stray", data: { type, through } })
    }
    return {
      Literal(node): void {
        if (node.value === type) check(node)
      },
      TemplateLiteral(node): void {
        if (staticText(node) === type) check(node)
      },
    }
  },
}

function isRead(node: Rule.Node): boolean {
  if (isKeyOrType(node)) return true
  const parent = node.parent
  if (parent?.type === "BinaryExpression")
    return COMPARISONS.has(parent.operator)
  if (parent?.type === "SwitchCase") return parent.test === node
  return false
}

function insideCallTo(node: Rule.Node, name: string): boolean {
  let child: Rule.Node = node
  for (let at = node.parent; at !== null; at = at.parent) {
    if (
      at.type === "CallExpression" &&
      at.callee.type === "Identifier" &&
      at.callee.name === name &&
      at.arguments.some((argument) => argument === child)
    )
      return true
    child = at
  }
  return false
}
