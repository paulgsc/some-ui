import type { Rule } from "eslint"

// ESTree shapes aren't modeled precisely by @types/eslint's Node union
// across this visitor (ImportExpression/CallExpression/Property shapes), so
// this rule reads them as `any` and narrows by `.type`, matching the
// convention documented in the other rules in this directory.
/* eslint-disable @typescript-eslint/no-explicit-any -- ESTree shapes not modeled precisely by @types/eslint's Node union, see comment above */

/**
 * The 8 wasm-bindgen crates under crates/* (UTL-WASM epic #529). Kept as a
 * literal list rather than a naming convention because these package names
 * don't share a common prefix/suffix to pattern-match on.
 */
const WASM_CRATE_NAMES = [
  "hangul-game-core",
  "leetype-wasm",
  "polyhedron",
  "some-bricks",
  "some-charts",
  "some-crossword",
  "some-hexagon",
  "viewport-rotation",
]

function collectImportExpressions(node: any, into: Set<any>): void {
  if (!node || typeof node !== "object") return
  if (Array.isArray(node)) {
    for (const item of node) collectImportExpressions(item, into)
    return
  }
  if (node.type === "ImportExpression") {
    into.add(node)
  }
  for (const key in node) {
    if (key === "parent") continue // avoid walking back up the tree
    const value = node[key]
    if (value && typeof value === "object") {
      collectImportExpressions(value, into)
    }
  }
}

export const noBareWasmSingleton: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow dynamically importing one of the repo's wasm-bindgen crates outside a createWasmLoader() call. Every wasm module load/init/singleton must go through @some-ui/wasm-loader (UTL-WASM #529) rather than a hand-rolled per-workspace loader.",
    },
    schema: [],
    messages: {
      bareWasmImport:
        'import("{{crate}}") outside createWasmLoader() is disallowed. Wrap this wasm crate\'s load in createWasmLoader({ importModule: ... }) from @some-ui/wasm-loader instead of hand-rolling a module-level singleton.',
    },
  },
  create(context) {
    const exempt = new Set<any>()

    return {
      // rawNode: any — see file-level disable comment above.
      CallExpression(rawNode: any): void {
        if (
          rawNode.callee?.type !== "Identifier" ||
          rawNode.callee.name !== "createWasmLoader"
        ) {
          return
        }

        const optionsArg = rawNode.arguments[0]
        if (optionsArg?.type !== "ObjectExpression") return

        const importModuleProp = optionsArg.properties.find(
          (prop: any) =>
            prop.type === "Property" &&
            !prop.computed &&
            (prop.key?.name === "importModule" ||
              prop.key?.value === "importModule")
        )
        if (!importModuleProp) return

        // Any import() reachable from inside the importModule callback is
        // exactly the loader's intended integration point, not a bare
        // singleton - exempt the whole subtree.
        collectImportExpressions(importModuleProp.value, exempt)
      },
      ImportExpression(rawNode: any): void {
        if (exempt.has(rawNode)) return

        const source = rawNode.source
        if (source?.type !== "Literal") return

        const value = source.value
        if (typeof value !== "string") return
        if (!WASM_CRATE_NAMES.includes(value)) return

        context.report({
          node: rawNode,
          messageId: "bareWasmImport",
          data: { crate: value },
        })
      },
    }
  },
}
