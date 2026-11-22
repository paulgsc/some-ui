/**
 * The brand's drawings as data (`@some-ui/styles/brand`: the cast, the
 * genres), drawn with React: each `CastNode` as its element, its
 * attributes in React's spelling. The one drawer for the essays' bubbles
 * (`lib/web-surface/call/essay-parts`) and Studio's genre art
 * (`components/studio/genre-thumbs`).
 */
import type { ReactNode } from "react"
import { createElement } from "react"
import type { CastNode } from "@some-ui/styles/brand/cast"

/** An SVG attribute in React's spelling: `stop-color` is `stopColor`; `data-*` stays. */
const reactAttr = (name: string): string =>
  name.startsWith("data-")
    ? name
    : name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

/**
 * `nodes` as React elements, each keyed by its place: a drawing is fixed
 * data, never reordered. `groundClass` paints the backdrop's rect
 * (`data-ground`), which the drawing leaves to its host's theme.
 */
export const drawNodes = (
  nodes: ReadonlyArray<CastNode>,
  groundClass?: string
): Array<ReactNode> => {
  const draw = (node: CastNode, key: number): ReactNode =>
    createElement(
      node.tag,
      {
        key,
        ...Object.fromEntries(
          Object.entries(node.attrs).map(([name, value]) => [
            reactAttr(name),
            value,
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
