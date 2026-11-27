/**
 * The brand's drawings as data (`@some-ui/styles/brand`: the cast, the
 * genres, the host's frames), drawn with React: each `CastNode` as its
 * element, its attributes in React's spelling. The one drawer for the
 * host's previews (`HostPreview`), the essays' bubbles and Studio's genre
 * art.
 */
import type { ReactNode } from "react"
import { createElement } from "react"
import type { CastNode } from "@some-ui/styles/brand/cast"

/** An SVG attribute in React's spelling: `stop-color` is `stopColor`; `data-*` stays. */
const reactAttr = (name: string): string =>
  name.startsWith("data-")
    ? name
    : name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

export type DrawOptions = {
  /** Paints the backdrop's rect (`data-ground`), which the drawing leaves to its host's theme. */
  readonly groundClass?: string
  /**
   * Names every id the drawing declares, and every `url(#…)` that points at
   * one, under this prefix, so two drawings on one page whose ids are the
   * same (every host frame's are `host-<character>-…`) each paint with
   * their own.
   */
  readonly idPrefix?: string
}

/**
 * `nodes` as React elements, each keyed by its place: a drawing is fixed
 * data, never reordered.
 */
export const drawNodes = (
  nodes: ReadonlyArray<CastNode>,
  { groundClass, idPrefix }: DrawOptions = {}
): Array<ReactNode> => {
  const scoped = (name: string, value: string | number): string | number => {
    if (idPrefix === undefined || typeof value === "number") return value
    if (name === "id") return `${idPrefix}-${value}`
    return value.replace(/url\(#([^)]+)\)/g, `url(#${idPrefix}-$1)`)
  }
  const draw = (node: CastNode, key: number): ReactNode =>
    createElement(
      node.tag,
      {
        key,
        ...Object.fromEntries(
          Object.entries(node.attrs).map(([name, value]) => [
            reactAttr(name),
            scoped(name, value),
          ])
        ),
        ...(groundClass !== undefined && "data-ground" in node.attrs
          ? { className: groundClass }
          : {}),
      },
      ...(node.children ?? []).map(draw)
    )
  return nodes.map(draw)
}
