import type { Rule, Scope } from "eslint"
import type * as ESTree from "estree"

import { keyName, propertyName } from "./ast-names.js"

/**
 * MIC7 (#2377): the microphone has one owner, `@some-ui/voice-capture`, and
 * a screen records through its take pattern. Outside the owner's files
 * (`owner`, a path fragment) this reports:
 *
 *   - `getUserMedia` read off anything (`navigator.mediaDevices`, say), and
 *     `new MediaRecorder(…)`: the browser's microphone, opened by hand;
 *   - an import or re-export of the kit's take machinery (`machinery`, such
 *     as `takeRunner` and `stepTake`) from its entry, or a read of one off
 *     a namespace import: a take of a screen's own beside the pattern's;
 *   - an import of the kit by a path past its entry (`@some-ui/voice-capture/src/…`,
 *     a relative `voice-capture/src/…`), other than its `/testing` entry;
 *   - a port factory (`ports`: `micRecorder` → `startRecording`) used other
 *     than as a call handed straight to its slot, `{ startRecording:
 *     micRecorder(…) }` or a parameter default `startRecording =
 *     micRecorder(…)`: anything else drives the recorder by hand.
 *
 * Types are not reported: naming `StartRecording` opens nothing.
 */

type Ports = ReadonlyMap<string, string>

function stringArray(value: unknown): ReadonlyArray<string> {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function importedName(spec: ESTree.ImportSpecifier): string | null {
  return spec.imported.type === "Identifier"
    ? spec.imported.name
    : typeof spec.imported.value === "string"
      ? spec.imported.value
      : null
}

/** typescript-eslint's `import type` / `import { type x }`, not in ESTree. */
function typeOnly(node: ESTree.Node): boolean {
  return Reflect.get(node, "importKind") === "type"
}

/** The name of the slot a call is handed to, if it is handed straight to one. */
function slotOf(call: Rule.Node): string | null {
  const parent = call.parent
  if (parent === null) return null
  if (parent.type === "Property" && parent.value === call)
    return keyName(parent.key, parent.computed)
  if (
    parent.type === "AssignmentPattern" &&
    parent.right === call &&
    parent.left.type === "Identifier"
  )
    return parent.left.name
  return null
}

export const noLocalMicrophone: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid opening the microphone, or running a take, outside @some-ui/voice-capture; record through its take pattern",
    },
    schema: [
      {
        type: "object",
        properties: {
          owner: { type: "string" },
          entry: { type: "string" },
          testing: { type: "string" },
          machinery: { type: "array", items: { type: "string" } },
          ports: {
            type: "object",
            additionalProperties: { type: "string" },
          },
        },
        required: ["owner", "entry", "testing", "machinery", "ports"],
        additionalProperties: false,
      },
    ],
    messages: {
      browserMicrophone:
        '`{{name}}` opens the microphone by hand. Only @some-ui/voice-capture opens it: record through the take pattern (`takePattern`, `stepTakePattern`). docs/monorepo-boundaries.md, "Patterns: whole flows, one closed set of options".',
      machinery:
        '`{{name}}` is @some-ui/voice-capture\'s own take machinery. A screen records through the take pattern (`takePattern`, `stepTakePattern`, `takeKit`) instead of running a take of its own. docs/monorepo-boundaries.md, "Patterns: whole flows, one closed set of options".',
      pastEntry:
        "Import @some-ui/voice-capture from `{{entry}}` (or its tests' `{{testing}}`), not by a path past its entry.",
      port: "Hand `{{name}}(…)` straight to a pattern's `{{slot}}` port (`{ {{slot}}: {{name}}(…) }`); anything else drives the microphone by hand.",
    },
  },
  create(context) {
    const options: unknown = context.options[0]
    const owner = String(Reflect.get(Object(options), "owner"))
    const entry = String(Reflect.get(Object(options), "entry"))
    const testing = String(Reflect.get(Object(options), "testing"))
    const machinery = new Set(
      stringArray(Reflect.get(Object(options), "machinery"))
    )
    const portOption: unknown = Reflect.get(Object(options), "ports")
    // A Map, so `toString` or `constructor` never reads the prototype's.
    const ports: Ports = new Map(
      (typeof portOption === "object" && portOption !== null
        ? Object.entries(portOption)
        : []
      ).filter((pair): pair is [string, string] => typeof pair[1] === "string")
    )
    const filename = context.filename.replaceAll("\\", "/")
    if (filename.includes(owner)) return {}

    function pastEntry(source: string): boolean {
      if (source === entry || source === testing) return false
      if (source.startsWith(`${entry}/`)) return true
      return /(^|\/)voice-capture\/(src|dist)\//.test(source)
    }

    // The kit's port factories and namespaces as this file imports them.
    const portVariables = new Map<Scope.Variable, string>()
    const namespaces = new Set<Scope.Variable>()
    const watched = new Set<string>()

    /** `callee` is `name`, the port factory: it must be called into its slot. */
    function checkPort(callee: Rule.Node, name: string): void {
      const slot = ports.get(name)
      if (slot === undefined) return
      const call = callee.parent
      const handed =
        call?.type === "CallExpression" &&
        call.callee === callee &&
        slotOf(call) === slot
      if (!handed)
        context.report({
          node: callee,
          messageId: "port",
          data: { name, slot },
        })
    }

    function reportExported(
      node: Rule.Node,
      specifiers: ReadonlyArray<ESTree.ExportSpecifier>
    ): void {
      for (const spec of specifiers) {
        if (typeOnly(spec)) continue
        const name =
          spec.local.type === "Identifier"
            ? spec.local.name
            : String(spec.local.value)
        if (machinery.has(name) || ports.has(name))
          context.report({ node, messageId: "machinery", data: { name } })
      }
    }

    return {
      Program(program): void {
        for (const statement of program.body) {
          if (statement.type !== "ImportDeclaration") continue
          if (statement.source.value !== entry || typeOnly(statement)) continue
          for (const spec of statement.specifiers) {
            if (spec.type === "ImportDefaultSpecifier" || typeOnly(spec))
              continue
            const name =
              spec.type === "ImportSpecifier" ? importedName(spec) : null
            if (spec.type === "ImportSpecifier" && !ports.has(name ?? ""))
              continue
            watched.add(spec.local.name)
            for (const variable of context.sourceCode.getDeclaredVariables(
              spec
            )) {
              if (name === null) namespaces.add(variable)
              else portVariables.set(variable, name)
            }
          }
        }
      },
      Identifier(node): void {
        if (!watched.has(node.name)) return
        const variable = context.sourceCode
          .getScope(node)
          .references.find(
            (reference) => reference.identifier === node
          )?.resolved
        if (variable == null) return
        const port = portVariables.get(variable)
        if (port !== undefined) {
          checkPort(node, port)
          return
        }
        if (!namespaces.has(variable)) return
        const member = node.parent
        if (member.type !== "MemberExpression" || member.object !== node) return
        const name = propertyName(member)
        if (name === null) return
        if (machinery.has(name))
          context.report({
            node: member,
            messageId: "machinery",
            data: { name },
          })
        checkPort(member, name)
      },
      ImportDeclaration(node): void {
        const source = String(node.source.value)
        if (pastEntry(source)) {
          context.report({
            node,
            messageId: "pastEntry",
            data: { entry, testing },
          })
          return
        }
        if (source !== entry || typeOnly(node)) return
        for (const spec of node.specifiers) {
          if (spec.type !== "ImportSpecifier" || typeOnly(spec)) continue
          const name = importedName(spec)
          // Reported on the declaration, so one disable above an import
          // covers every name it brings in.
          if (name !== null && machinery.has(name))
            context.report({ node, messageId: "machinery", data: { name } })
        }
      },
      ExportNamedDeclaration(node): void {
        if (node.source == null) return
        const source = String(node.source.value)
        if (pastEntry(source)) {
          context.report({
            node,
            messageId: "pastEntry",
            data: { entry, testing },
          })
          return
        }
        if (source === entry && !typeOnly(node))
          reportExported(node, node.specifiers)
      },
      ExportAllDeclaration(node): void {
        const source = String(node.source.value)
        if (pastEntry(source))
          context.report({
            node,
            messageId: "pastEntry",
            data: { entry, testing },
          })
        else if (source === entry && !typeOnly(node))
          context.report({
            node,
            messageId: "machinery",
            data: { name: `* from ${entry}` },
          })
      },
      MemberExpression(node): void {
        if (propertyName(node) === "getUserMedia")
          context.report({
            node,
            messageId: "browserMicrophone",
            data: { name: "getUserMedia" },
          })
      },
      NewExpression(node): void {
        const callee = node.callee
        const name =
          callee.type === "Identifier"
            ? callee.name
            : callee.type === "MemberExpression"
              ? propertyName(callee)
              : null
        if (name === "MediaRecorder")
          context.report({
            node,
            messageId: "browserMicrophone",
            data: { name: "new MediaRecorder" },
          })
      },
    }
  },
}
