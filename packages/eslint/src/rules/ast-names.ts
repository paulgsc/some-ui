import type { Rule } from "eslint"
import type * as ESTree from "estree"

/** A key's name: `x` when not computed, or a string literal `"x"` / `["x"]`. */
export function keyName(key: ESTree.Node, computed: boolean): string | null {
  if (!computed && key.type === "Identifier") return key.name
  if (key.type === "Literal" && typeof key.value === "string") return key.value
  return null
}

export function propertyName(node: ESTree.MemberExpression): string | null {
  if (node.property.type === "PrivateIdentifier") return null
  return keyName(node.property, node.computed)
}

/** A template literal's text when it has no `${}`, else null. */
export function staticText(node: ESTree.TemplateLiteral): string | null {
  if (node.expressions.length > 0) return null
  return node.quasis[0]?.value.cooked ?? null
}

/**
 * A string that names a field or a type rather than a value: an object or
 * class key (`{ "progress": 0 }`), a TypeScript literal type
 * (`type: "LIVE_PLAYBACK"`) or a quoted property signature.
 */
export function isKeyOrType(node: Rule.Node): boolean {
  const parent = node.parent
  if (parent === null) return false
  // TypeScript nodes are not in ESTree's union.
  const kind: string = parent.type
  if (kind === "TSLiteralType") return true
  if (kind === "TSPropertySignature") return Reflect.get(parent, "key") === node
  return (
    (parent.type === "Property" || parent.type === "PropertyDefinition") &&
    parent.key === node &&
    !parent.computed
  )
}

/** One string option, read off schema-validated options without an assertion. */
export function stringOption(options: unknown, key: string): string | null {
  if (typeof options !== "object" || options === null) return null
  const value: unknown = Reflect.get(options, key)
  return typeof value === "string" ? value : null
}
