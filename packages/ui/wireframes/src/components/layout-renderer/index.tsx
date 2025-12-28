import type { ReactNode } from "react"
import { useMemo } from "react"
import type { SolvedNode } from "@wireframes/lib/resizable-layout"

export const RenderSolved = <T extends string>({
  node,
  renderLeaf,
  onLeafClick,
  transitionMs = 300,
}: {
  node: SolvedNode<T>
  renderLeaf: (id: T) => ReactNode
  onLeafClick?: (id: T, position: { x: number; y: number }) => void
  transitionMs?: number
}) => {
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
              if (onLeafClick) {
                onLeafClick(current.id, {
                  x: e.clientX,
                  y: e.clientY,
                })
              }
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
            className="border border-pink-100 overflow-hidden"
            data-pane-id={current.id}
          >
            <div className="size-full relative">{renderLeaf(current.id)}</div>
          </div>
        )
      } else {
        // push children in reverse order to maintain original order
        for (let i = current.children.length - 1; i >= 0; i--) {
          stack.push(current.children[i])
        }
      }
    }

    return out
  }, [node, renderLeaf, onLeafClick, transitionMs])

  return <>{elements}</>
}
