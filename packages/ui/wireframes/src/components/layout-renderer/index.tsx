import type { ReactNode } from "react"
import { useMemo } from "react"
import type { SolvedNode } from "@wireframes/lib/resizable-layout"

export const RenderSolved = <T extends string>({
  node,
  renderLeaf,
  onLeafClick,
  transitionMs = 300,
  debug = true,
}: {
  node: SolvedNode<T>
  renderLeaf: (id: T) => ReactNode
  onLeafClick?: (id: T) => void
  transitionMs?: number
  debug?: boolean
}) => {
  // Iterative render using useMemo for performance
  const elements = useMemo(() => {
    const stack: Array<SolvedNode<T>> = [node]
    const out: Array<ReactNode> = []

    while (stack.length) {
      const current = stack.pop()!

      if (current.type === "leaf") {
        const { x, y, width, height } = current.rect

        // Debug logging
        if (debug) {
          console.log(`Rendering leaf ${current.id}:`, {
            x,
            y,
            width,
            height,
            right: x + width,
            bottom: y + height,
          })
        }

        out.push(
          <div
            key={current.id}
            onClick={() => onLeafClick?.(current.id)}
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
  }, [node, renderLeaf, onLeafClick, transitionMs, debug])

  return <>{elements}</>
}
