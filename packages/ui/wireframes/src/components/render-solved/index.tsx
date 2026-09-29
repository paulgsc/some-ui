import type { JSX, ReactNode } from "react"
import { useMemo } from "react"
import type { SolvedNode } from "@wireframes/lib/layout-types"
import { cn } from "some-ui-utils"

export const RenderSolved = <T extends string>({
  node,
  renderLeaf,
  onLeafClick,
  onLeafContextMenu,
  transitionMs = 300,
}: {
  node: SolvedNode<T>
  renderLeaf: (id: T) => ReactNode
  onLeafClick?: (id: T, position: { x: number; y: number }) => void
  /** Fires on right-click independent of `onLeafClick` - e.g. story 7's always-on resize affordance, unrelated to whether focus (`onLeafClick`) is enabled. */
  onLeafContextMenu?: (id: T, position: { x: number; y: number }) => void
  transitionMs?: number
}): JSX.Element => {
  // A pane's border separates it from its neighbours, so a layout of one pane
  // has nothing to separate and draws none. That is the whole screen on a
  // phone, where the viewport is full-bleed and a frame is only an outline
  // around the edge of the display.
  const lone = node.type === "leaf"

  // Iterative render using useMemo for performance
  const elements = useMemo(() => {
    const stack: Array<SolvedNode<T>> = [node]
    const out: Array<ReactNode> = []

    while (stack.length) {
      const current = stack.pop()!

      if (current.type === "leaf") {
        const { x, y, width, height } = current.rect
        out.push(
          <div
            key={current.id}
            onContextMenu={(e) => {
              e.preventDefault()
              const position = { x: e.clientX, y: e.clientY }
              onLeafClick?.(current.id, position)
              onLeafContextMenu?.(current.id, position)
            }}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width,
              height,
              cursor: onLeafClick ? "pointer" : "default",
              transition: `all ${transitionMs}ms ease-in-out`,
            }}
            // The theme's own border token: a hardcoded light pink read as a
            // glaring white frame on every dark palette.
            className={cn("overflow-hidden", !lone && "border border-border")}
            data-pane-id={current.id}
          >
            <div className="size-full relative">{renderLeaf(current.id)}</div>
          </div>
        )
      } else {
        for (let i = current.children.length; i-- > 0; ) {
          const child = current.children[i]!
          stack.push(child)
        }
      }
    }

    return out
  }, [node, lone, renderLeaf, onLeafClick, onLeafContextMenu, transitionMs])

  return <>{elements}</>
}
