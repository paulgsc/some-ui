import type { Rule } from "eslint"

/**
 * A host that renders applets through `@some-ui/content-registry` gets them
 * lazily: the registry maps a key to a dynamic `import()`, so each applet
 * lands in its own chunk and costs nothing until a session actually binds
 * it. A single static *value* import of that same package from the host
 * defeats it entirely - the bundler now has a static edge, the applet joins
 * the eager graph, and the dynamic import in the registry becomes a
 * formality.
 *
 * The failure is invisible in review. `import type { WordEntry }` and
 * `import { interviewQuestions }` differ by one keyword, sit in the same
 * files, and `rg '@some-ui/honeycomb'` reports both identically - but the
 * first is erased at compile time and the second is a bundle edge. Only the
 * built output tells them apart, and nobody diffs chunk manifests.
 *
 * So: type imports are always fine, value imports need a reason. The
 * `allow` option is that reason, per package, and the reason belongs in the
 * config next to it.
 */
/**
 * Reads `importKind` off an AST node.
 *
 * ESLint's core `ImportDeclaration` type predates both `import type` and
 * per-specifier `type`, so the property exists at runtime (the TS parser
 * sets it) but not on the declared type. `Reflect.get` reads it without an
 * assertion.
 */
function stringList(options: unknown, key: string): Array<string> {
  if (typeof options !== "object" || options === null) return []
  const value: unknown = Reflect.get(options, key)
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === "string")
}

function importKindOf(node: object): string | undefined {
  const value: unknown = Reflect.get(node, "importKind")
  return typeof value === "string" ? value : undefined
}

export const noEagerRegistryImport: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban static value imports of registry-loaded applet packages from a host app; type-only imports are fine",
    },
    schema: [
      {
        type: "object",
        properties: {
          // Packages the content registry loads lazily.
          packages: { type: "array", items: { type: "string" } },
          // Packages a host legitimately uses directly as well, e.g. an
          // editor surface that is not the registry-loaded component.
          allow: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      eagerImport:
        'Value import of "{{name}}", which the content registry loads lazily - this puts it in the eager bundle and undoes that. If you only need types, write `import type`. If you need the value, the applet should own it instead (pass it plain config through scene props, or give the component a default), or add "{{name}}" to this rule\'s `allow` with a comment saying why.',
    },
  },
  create(context) {
    // Read off the schema-validated options without an assertion: ESLint
    // types `context.options` as `unknown[]`, and the schema above is what
    // actually guarantees the shape.
    const options: unknown = context.options[0]
    const watched = new Set(stringList(options, "packages"))
    const allowed = new Set(stringList(options, "allow"))

    return {
      ImportDeclaration(node): void {
        const name = String(node.source.value)
        if (!watched.has(name) || allowed.has(name)) return

        // `import type { X } from "pkg"` is erased; so is a declaration
        // whose every specifier is individually `type`-qualified.
        if (importKindOf(node) === "type") return

        const specifiers = node.specifiers
        const everySpecifierIsType =
          specifiers.length > 0 &&
          specifiers.every(
            (specifier) =>
              specifier.type === "ImportSpecifier" &&
              importKindOf(specifier) === "type"
          )
        if (everySpecifierIsType) return

        context.report({ node, messageId: "eagerImport", data: { name } })
      },
    }
  },
}
