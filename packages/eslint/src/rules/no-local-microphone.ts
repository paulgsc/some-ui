import type { Rule, Scope } from "eslint"
import type * as ESTree from "estree"

import { keyName, propertyName, staticText } from "./ast-names.js"

/**
 * MIC7 (#2377): the microphone has one owner, `@some-ui/voice-capture`, and
 * a screen records through its take pattern. Outside the owner's files
 * (`owner`, a path fragment) this reports the ways in ordinary code takes:
 *
 *   - `getUserMedia`, read off anything (`navigator.mediaDevices`, say) or
 *     destructured out of it, and the `MediaRecorder` global as a value
 *     (`new MediaRecorder(…)`, `window.MediaRecorder`, `{ MediaRecorder }`):
 *     the browser's microphone, opened by hand;
 *   - the kit's take machinery (`machinery`, such as `takeRunner` and
 *     `stepTake`) imported, re-exported, read or destructured off a
 *     namespace (`import * as kit`, `await import(entry)`), or spied on
 *     (`vi.spyOn(kit, "takeRunner")`): a take of a screen's own beside the
 *     pattern's;
 *   - an import of the kit, static or dynamic, by a path past its entry
 *     (`@some-ui/voice-capture/src/…`, a relative `voice-capture/src/…`),
 *     other than its `/testing` entry; and that entry itself where
 *     `testingAllowed` is false (the phone's own code);
 *   - a port factory (`ports`: `micRecorder` → `startRecording`) used other
 *     than as a call handed straight to its slot, `{ startRecording:
 *     micRecorder(…) }` or a parameter default `startRecording =
 *     micRecorder(…)`: anything else drives the recorder by hand.
 *
 * Types are not reported: naming `StartRecording`, or re-exporting a type,
 * opens nothing. Code bent on getting past it (`Reflect.get`, an alias of
 * a namespace) is out of its scope: it catches the drift ordinary code makes.
 */

type Ports = ReadonlyMap<string, string>

const GLOBALS = new Set(["window", "globalThis", "self"])

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

/**
 * typescript-eslint's `import type`, `import { type x }`, `export type …`
 * and `export { type x }`, none of which is in ESTree.
 */
function typeOnly(node: ESTree.Node): boolean {
  return (
    Reflect.get(node, "importKind") === "type" ||
    Reflect.get(node, "exportKind") === "type"
  )
}

/** An import that brings in types alone: `import type`, or every name `type`. */
function typeOnlyImport(node: ESTree.ImportDeclaration): boolean {
  return (
    typeOnly(node) ||
    (node.specifiers.length > 0 && node.specifiers.every(typeOnly))
  )
}

/** A module specifier written as a string, or a template with no `${}`. */
function staticSource(node: ESTree.Node | null | undefined): string | null {
  if (node?.type === "Literal" && typeof node.value === "string")
    return node.value
  if (node?.type === "TemplateLiteral") return staticText(node)
  return null
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

/** The names an object pattern takes out at its top level. */
function patternKeys(pattern: ESTree.ObjectPattern): Array<string> {
  return pattern.properties.flatMap((property) => {
    if (property.type !== "Property") return []
    const name = keyName(property.key, property.computed)
    return name === null ? [] : [name]
  })
}

/** `import(source)`, awaited or not. */
function importOf(node: ESTree.Node | null | undefined): string | null {
  const call = node?.type === "AwaitExpression" ? node.argument : node
  return call?.type === "ImportExpression" ? staticSource(call.source) : null
}

/** `vi.spyOn` or `vitest.spyOn`. */
function isSpyOn(callee: ESTree.Node): boolean {
  return (
    callee.type === "MemberExpression" &&
    callee.object.type === "Identifier" &&
    (callee.object.name === "vi" || callee.object.name === "vitest") &&
    propertyName(callee) === "spyOn"
  )
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
          testingAllowed: { type: "boolean" },
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
      testing:
        "`{{testing}}` is for tests: the phone's own code records on the real microphone, through `{{entry}}`.",
      port: "Hand `{{name}}(…)` straight to a pattern's `{{slot}}` port (`{ {{slot}}: {{name}}(…) }`); anything else drives the microphone by hand.",
      spied:
        "Spying on the kit's `{{name}}` swaps it for a copy written here. Give the code under test the simulated microphone from `{{testing}}` instead.",
    },
  },
  create(context) {
    const options: unknown = context.options[0]
    const owner = String(Reflect.get(Object(options), "owner"))
    const entry = String(Reflect.get(Object(options), "entry"))
    const testing = String(Reflect.get(Object(options), "testing"))
    const testingAllowed =
      Reflect.get(Object(options), "testingAllowed") !== false
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

    /** Reports a source past the entry, or the testing one where it is not allowed. */
    function checkSource(
      node: ESTree.Node,
      source: string,
      types = false
    ): boolean {
      if (pastEntry(source)) {
        context.report({
          node,
          messageId: "pastEntry",
          data: { entry, testing },
        })
        return true
      }
      if (source === testing && !testingAllowed && !types) {
        context.report({ node, messageId: "testing", data: { entry, testing } })
        return true
      }
      return false
    }

    // The kit's port factories and namespaces as this file holds them.
    const portVariables = new Map<Scope.Variable, string>()
    const namespaces = new Set<Scope.Variable>()
    const watched = new Set<string>(["MediaRecorder"])

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

    /** A name taken out of the kit some other way than a call into a slot. */
    function checkTaken(node: ESTree.Node, name: string): void {
      if (machinery.has(name))
        context.report({ node, messageId: "machinery", data: { name } })
      const slot = ports.get(name)
      if (slot !== undefined)
        context.report({ node, messageId: "port", data: { name, slot } })
    }

    function watchNamespace(variable: Scope.Variable): void {
      namespaces.add(variable)
      watched.add(variable.name)
    }

    /** `id` reads the kit's namespace: by member, by destructuring, or spied on. */
    function checkNamespace(id: ESTree.Identifier & Rule.Node): void {
      const parent = id.parent
      if (parent.type === "MemberExpression" && parent.object === id) {
        const name = propertyName(parent)
        if (name === null) return
        if (machinery.has(name))
          context.report({
            node: parent,
            messageId: "machinery",
            data: { name },
          })
        checkPort(parent, name)
        return
      }
      const pattern =
        parent.type === "VariableDeclarator" && parent.init === id
          ? parent.id
          : parent.type === "AssignmentExpression" && parent.right === id
            ? parent.left
            : null
      if (pattern?.type === "ObjectPattern") {
        for (const name of patternKeys(pattern)) checkTaken(parent, name)
        return
      }
      if (
        parent.type === "CallExpression" &&
        parent.arguments[0] === id &&
        isSpyOn(parent.callee)
      ) {
        const name = staticSource(parent.arguments[1])
        if (name !== null && (machinery.has(name) || ports.has(name)))
          context.report({
            node: parent,
            messageId: "spied",
            data: { name, testing },
          })
      }
    }

    /** A bare `MediaRecorder` read as a value from the page's globals. */
    function checkMediaRecorder(
      node: ESTree.Identifier & Rule.Node,
      reference: Scope.Reference
    ): void {
      // A global the config declares (`globals.browser`) resolves to a
      // variable with no definition; only a local one is defined.
      if ((reference.resolved?.defs.length ?? 0) > 0) return
      // typescript-eslint marks a type position's reference; ESLint's own
      // Reference type does not carry the flag.
      if (Reflect.get(reference, "isTypeReference") === true) return
      // `typeof MediaRecorder` in a type reads its type, not the value.
      const inTypeQuery = context.sourceCode
        .getAncestors(node)
        .some((ancestor) => {
          const kind: string = ancestor.type
          return kind === "TSTypeQuery"
        })
      if (inTypeQuery) return
      context.report({
        node,
        messageId: "browserMicrophone",
        data: { name: "MediaRecorder" },
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
            const variables = context.sourceCode.getDeclaredVariables(spec)
            if (spec.type === "ImportNamespaceSpecifier") {
              for (const variable of variables) watchNamespace(variable)
              continue
            }
            const name = importedName(spec)
            if (name === null || !ports.has(name)) continue
            watched.add(spec.local.name)
            for (const variable of variables) portVariables.set(variable, name)
          }
        }
      },
      Identifier(node): void {
        if (!watched.has(node.name)) return
        const reference = context.sourceCode
          .getScope(node)
          .references.find((candidate) => candidate.identifier === node)
        if (reference === undefined) return
        if (node.name === "MediaRecorder") {
          checkMediaRecorder(node, reference)
          return
        }
        const variable = reference.resolved
        if (variable === null) return
        const port = portVariables.get(variable)
        if (port !== undefined) checkPort(node, port)
        else if (namespaces.has(variable)) checkNamespace(node)
      },
      VariableDeclarator(node): void {
        const source = importOf(node.init)
        if (source !== entry) return
        // `const { takeRunner } = await import(entry)`, or a namespace kept
        // whole: `const kit = await import(entry)`.
        if (node.id.type === "ObjectPattern")
          for (const name of patternKeys(node.id)) checkTaken(node, name)
        else
          for (const variable of context.sourceCode.getDeclaredVariables(node))
            watchNamespace(variable)
      },
      ImportExpression(node): void {
        const source = staticSource(node.source)
        if (source !== null) checkSource(node, source)
      },
      ImportDeclaration(node): void {
        const source = String(node.source.value)
        if (checkSource(node, source, typeOnlyImport(node))) return
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
        if (checkSource(node, source, typeOnly(node))) return
        if (source === entry && !typeOnly(node))
          reportExported(node, node.specifiers)
      },
      ExportAllDeclaration(node): void {
        const source = String(node.source.value)
        if (checkSource(node, source, typeOnly(node))) return
        if (source === entry && !typeOnly(node))
          context.report({
            node,
            messageId: "machinery",
            data: { name: `* from ${entry}` },
          })
      },
      MemberExpression(node): void {
        const name = propertyName(node)
        if (name === "getUserMedia")
          context.report({
            node,
            messageId: "browserMicrophone",
            data: { name },
          })
        if (
          name === "MediaRecorder" &&
          node.object.type === "Identifier" &&
          GLOBALS.has(node.object.name)
        )
          context.report({
            node,
            messageId: "browserMicrophone",
            data: { name },
          })
      },
      // `const { getUserMedia } = navigator.mediaDevices`, nested
      // (`{ mediaDevices: { getUserMedia } }`) or not, and `{ MediaRecorder }`.
      "ObjectPattern > Property"(node: ESTree.Property & Rule.Node): void {
        const name = keyName(node.key, node.computed)
        if (name === "getUserMedia" || name === "MediaRecorder")
          context.report({
            node,
            messageId: "browserMicrophone",
            data: { name },
          })
      },
    }
  },
}
