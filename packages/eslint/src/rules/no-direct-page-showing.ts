import type { Rule, Scope } from "eslint"
import type * as ESTree from "estree"

import { isGlobal } from "./require-scoped-lifetime.js"

/** What "is the page showing" is decided from (GOOD_CITIZEN.md, L6). */
const PAGE_SHOWING = new Set(["visibilityState", "hidden", "fullscreenElement"])
const GLOBAL_OBJECTS = new Set(["window", "globalThis", "self"])

/**
 * Invariant L6 in extensions/common's GOOD_CITIZEN.md: only one module
 * decides whether the page is showing. An adopted workspace reads
 * `document.visibilityState`, `document.hidden` and
 * `document.fullscreenElement` through `isPageShowing` / `watchPageShowing`
 * (`@some-extension/common`), never directly, so a real-browser check of what
 * "showing" means has one place to cover.
 *
 * It reads the global `document` (not a parameter or local of that name), as
 * `document.x`, `document["x"]`, `window.document.x` (or `globalThis`,
 * `self`), and `const { x } = document`. A `Document` reached any other way,
 * an alias (`const d = document`) or a parameter, is out of its reach and
 * stays with review. Off in the shared config; an adopted workspace (one
 * with `require-scoped-lifetime` at error) turns it on.
 */
export const noDirectPageShowing: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Read whether the page is showing only through isPageShowing / watchPageShowing (Good-Citizen invariant L6)",
    },
    schema: [],
    messages: {
      direct:
        "Read `document.{{name}}` through isPageShowing or watchPageShowing from @some-extension/common: one module decides whether the page is showing (GOOD_CITIZEN.md, L6).",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode
    return {
      MemberExpression(node): void {
        const name = propertyName(node)
        if (name === null || !PAGE_SHOWING.has(name)) return
        if (!isGlobalDocument(node.object, sourceCode.getScope(node))) return
        context.report({ node, messageId: "direct", data: { name } })
      },
      VariableDeclarator(node): void {
        if (node.id.type !== "ObjectPattern" || !node.init) return
        if (!isGlobalDocument(node.init, sourceCode.getScope(node))) return
        for (const property of node.id.properties) {
          if (property.type !== "Property") continue
          const name = keyName(property.key, property.computed)
          if (name !== null && PAGE_SHOWING.has(name))
            context.report({
              node: property,
              messageId: "direct",
              data: { name },
            })
        }
      },
    }
  },
}

function propertyName(node: ESTree.MemberExpression): string | null {
  if (node.property.type === "PrivateIdentifier") return null
  return keyName(node.property, node.computed)
}

function keyName(key: ESTree.Node, computed: boolean): string | null {
  if (!computed && key.type === "Identifier") return key.name
  if (key.type === "Literal" && typeof key.value === "string") return key.value
  return null
}

/** `document`, or `window.document` (or `globalThis`, `self`), unshadowed. */
function isGlobalDocument(node: ESTree.Node, scope: Scope.Scope): boolean {
  if (node.type === "Identifier")
    return node.name === "document" && isGlobal("document", scope)
  return (
    node.type === "MemberExpression" &&
    propertyName(node) === "document" &&
    node.object.type === "Identifier" &&
    GLOBAL_OBJECTS.has(node.object.name) &&
    isGlobal(node.object.name, scope)
  )
}
