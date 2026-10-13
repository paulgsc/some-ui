/* eslint-disable @typescript-eslint/no-explicit-any -- ESTree shapes not modeled precisely by @types/eslint's Node union */

type Node = any

/** `useState`, or `React.useState`, as the name of the hook called. */
export function hookName(callee: Node): string | null {
  let name: unknown = null
  if (callee.type === "Identifier") name = callee.name
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    callee.object.name === "React" &&
    callee.property.type === "Identifier"
  ) {
    name = callee.property.name
  }
  return typeof name === "string" ? name : null
}

export function within(inner: Node, outer: Node): boolean {
  const [a, b] = inner.range ?? [0, 0]
  const [c, d] = outer.range ?? [0, 0]
  return a >= c && b <= d
}
