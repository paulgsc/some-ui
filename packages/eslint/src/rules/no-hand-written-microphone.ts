import type { Rule } from "eslint"
import type * as ESTree from "estree"

import { keyName, propertyName, staticText } from "./ast-names.js"

/**
 * MIC7 (#2377): one simulated microphone stands in for the real one, the
 * kit's `/testing` entry's. Outside the owner's files (`owner`, a path
 * fragment) this reports a microphone written by hand:
 *
 *   - a function whose declared return type is the kit's `Recording`, or a
 *     `Promise` of one: it builds a recording;
 *   - an object literal given that type (a variable's annotation, `as`,
 *     `satisfies`), and any object literal with a recording's own members,
 *     `level`, `finish` and `discard`, whatever its annotation;
 *   - a function literal given the kit's `StartRecording` type the same
 *     ways: a microphone of its own;
 *   - `vi.mock` or `vi.doMock` of the kit's entry, which swaps the kit for a
 *     copy written in the test.
 *
 * The two type names count only where they are imported from `entry`, so a
 * local `Recording` component or type is not read as the kit's. A parameter
 * typed `StartRecording` is not reported: it takes the simulated one.
 */

const RECORDING_MEMBERS = ["level", "finish", "discard"] as const

type Named = { recording: Set<string>; start: Set<string> }

/** typescript-eslint nodes are outside ESTree's union: read them loosely. */
function field(node: unknown, key: string): unknown {
  return typeof node === "object" && node !== null
    ? Reflect.get(node, key)
    : undefined
}

function isFunction(node: unknown): boolean {
  const type = field(node, "type")
  return type === "ArrowFunctionExpression" || type === "FunctionExpression"
}

/** The local name a type annotation refers to, `Promise<X>` read as `X`. */
function referred(type: unknown, promised: boolean): string | null {
  if (field(type, "type") !== "TSTypeReference") return null
  const name = field(field(type, "typeName"), "name")
  if (typeof name !== "string") return null
  if (name === "Promise" && promised) {
    const params: unknown = field(
      field(type, "typeArguments") ?? field(type, "typeParameters"),
      "params"
    )
    return Array.isArray(params) && params.length === 1
      ? referred(params[0], false)
      : null
  }
  return name
}

function annotationOf(node: unknown): unknown {
  return field(field(node, "typeAnnotation"), "typeAnnotation")
}

export const noHandWrittenMicrophone: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid a hand-written microphone (a Recording or StartRecording literal, a vi.mock of @some-ui/voice-capture); use @some-ui/voice-capture/testing",
    },
    schema: [
      {
        type: "object",
        properties: {
          owner: { type: "string" },
          entry: { type: "string" },
          testing: { type: "string" },
        },
        required: ["owner", "entry", "testing"],
        additionalProperties: false,
      },
    ],
    messages: {
      recording:
        "This is a microphone written by hand. Use `simulatedMicrophone` from `{{testing}}`, whose script says what it hears, so a test meets the take as the phone does.",
      mock: '`vi.{{how}}("{{entry}}")` swaps the microphone\'s owner for a copy written here. Give the code under test the simulated microphone (and `memoryShelf`) from `{{testing}}` instead.',
    },
  },
  create(context) {
    const options: unknown = context.options[0]
    const owner = String(field(options, "owner"))
    const entry = String(field(options, "entry"))
    const testing = String(field(options, "testing"))
    const filename = context.filename.replaceAll("\\", "/")
    if (filename.includes(owner)) return {}

    const named: Named = { recording: new Set(), start: new Set() }

    function kitType(type: unknown, promised: boolean): keyof Named | null {
      const name = referred(type, promised)
      if (name === null) return null
      if (named.recording.has(name)) return "recording"
      if (named.start.has(name)) return "start"
      return null
    }

    // One report per microphone: a recording built inside a function
    // already reported, or given a type already reported, is that one.
    const reported = new WeakSet<ESTree.Node>()

    function report(node: ESTree.Node): void {
      const ancestors = context.sourceCode.getAncestors(node)
      if (ancestors.some((ancestor) => reported.has(ancestor))) return
      reported.add(node)
      context.report({ node, messageId: "recording", data: { testing } })
    }

    /** `value` given `type`: an object as a Recording, a function as a StartRecording. */
    function typed(node: ESTree.Node, value: unknown, type: unknown): void {
      const kind = kitType(type, false)
      if (kind === "recording" && field(value, "type") === "ObjectExpression")
        report(node)
      if (kind === "start" && isFunction(value)) report(node)
    }

    function checkReturn(node: ESTree.Node): void {
      const returns = field(field(node, "returnType"), "typeAnnotation")
      if (kitType(returns, true) === "recording") report(node)
    }

    return {
      Program(node): void {
        for (const statement of node.body) {
          if (statement.type !== "ImportDeclaration") continue
          if (statement.source.value !== entry) continue
          for (const spec of statement.specifiers) {
            if (spec.type !== "ImportSpecifier") continue
            const imported =
              spec.imported.type === "Identifier"
                ? spec.imported.name
                : String(spec.imported.value)
            if (imported === "Recording") named.recording.add(spec.local.name)
            if (imported === "StartRecording") named.start.add(spec.local.name)
          }
        }
      },
      FunctionDeclaration: checkReturn,
      FunctionExpression: checkReturn,
      ArrowFunctionExpression: checkReturn,
      VariableDeclarator(node): void {
        typed(node, node.init, annotationOf(node.id))
      },
      // TypeScript-only nodes: the selector strings are not in ESTree's map.
      "TSAsExpression, TSSatisfiesExpression"(node: Rule.Node): void {
        typed(node, field(node, "expression"), field(node, "typeAnnotation"))
      },
      ObjectExpression(node): void {
        const keys = new Set(
          node.properties.map((property) =>
            property.type === "Property"
              ? keyName(property.key, property.computed)
              : null
          )
        )
        if (RECORDING_MEMBERS.every((member) => keys.has(member))) report(node)
      },
      CallExpression(node): void {
        const callee = node.callee
        if (callee.type !== "MemberExpression") return
        if (callee.object.type !== "Identifier" || callee.object.name !== "vi")
          return
        const how = propertyName(callee)
        if (how !== "mock" && how !== "doMock") return
        const first = node.arguments[0]
        const target =
          first?.type === "Literal"
            ? first.value
            : first?.type === "TemplateLiteral"
              ? staticText(first)
              : null
        if (target === entry)
          context.report({
            node,
            messageId: "mock",
            data: { how, entry, testing },
          })
      },
    }
  },
}
