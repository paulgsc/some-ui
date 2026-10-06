import type { JSX, MouseEvent as ReactMouseEvent } from "react"
import { useState } from "react"
import type { SlotId } from "@some-ui/types"
import type { Rect } from "@wireframes/lib/layout-types"
import { cn } from "some-ui-utils"

type Edge = "left" | "right" | "top" | "bottom"

type LeafResizeHandlesProps = {
  leafId: SlotId
  rect: Rect
  onResize: (
    id: SlotId,
    edge: Edge,
    deltaPx: number,
    containerSizePx: number
  ) => void
}

const EDGES: ReadonlyArray<Edge> = ["left", "right", "top", "bottom"]
const KEYBOARD_NUDGE_PX = 10

/**
 * Arrow-key nudge deltas, signed to match dragging that same edge with the
 * mouse (e.g. dragging the trailing "right" edge rightward grows the leaf,
 * same sign `resizeRegion` already expects - see layout-intent.ts).
 */
const NUDGE_DELTA_BY_KEY: Record<Edge, Partial<Record<string, number>>> = {
  left: { ArrowLeft: -KEYBOARD_NUDGE_PX, ArrowRight: KEYBOARD_NUDGE_PX },
  right: { ArrowRight: KEYBOARD_NUDGE_PX, ArrowLeft: -KEYBOARD_NUDGE_PX },
  top: { ArrowUp: -KEYBOARD_NUDGE_PX, ArrowDown: KEYBOARD_NUDGE_PX },
  bottom: { ArrowDown: KEYBOARD_NUDGE_PX, ArrowUp: -KEYBOARD_NUDGE_PX },
}

/**
 * Right-click any leaf to arm it for resize without edit mode: the `resize`
 * intent's drag handles, on demand so they do not compete with content.
 */
export const LeafResizeHandles = ({
  leafId,
  rect,
  onResize,
}: LeafResizeHandlesProps): JSX.Element => {
  const [activeEdge, setActiveEdge] = useState<Edge | null>(null)

  const handleMouseDown =
    (edge: Edge) =>
    (e: ReactMouseEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      setActiveEdge(edge)

      const isHorizontal = edge === "left" || edge === "right"
      const startPos = isHorizontal ? e.clientX : e.clientY
      const containerSizePx = isHorizontal ? rect.width : rect.height

      const handleGlobalMouseMove = (moveEvent: MouseEvent): void => {
        const currentPos = isHorizontal ? moveEvent.clientX : moveEvent.clientY
        onResize(leafId, edge, currentPos - startPos, containerSizePx)
      }

      const handleGlobalMouseUp = (): void => {
        setActiveEdge(null)
        window.removeEventListener("mousemove", handleGlobalMouseMove)
        window.removeEventListener("mouseup", handleGlobalMouseUp)
      }

      window.addEventListener("mousemove", handleGlobalMouseMove)
      window.addEventListener("mouseup", handleGlobalMouseUp)
    }

  const handleKeyDown =
    (edge: Edge) =>
    (e: React.KeyboardEvent): void => {
      const delta = NUDGE_DELTA_BY_KEY[edge][e.key]
      if (delta === undefined) return
      e.preventDefault()

      const isHorizontal = edge === "left" || edge === "right"
      const containerSizePx = isHorizontal ? rect.width : rect.height
      onResize(leafId, edge, delta, containerSizePx)
    }

  return (
    <div
      className="pointer-events-none absolute z-30"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
      }}
    >
      <div className="ring-primary pointer-events-none absolute inset-0 ring-2 ring-inset" />

      {EDGES.map((edge) => (
        <div
          key={edge}
          role="slider"
          aria-orientation={
            edge === "left" || edge === "right" ? "vertical" : "horizontal"
          }
          aria-label={`Resize ${leafId} from the ${edge} edge`}
          aria-valuenow={
            edge === "left" || edge === "right" ? rect.width : rect.height
          }
          aria-valuemin={0}
          tabIndex={0}
          onMouseDown={handleMouseDown(edge)}
          onKeyDown={handleKeyDown(edge)}
          className={cn(
            // Kept inside the leaf's rect: at the viewport edge an
            // `overflow-hidden` ancestor would clip a straddling handle.

            "bg-primary/60 hover:bg-primary pointer-events-auto absolute transition-colors",
            (edge === "left" || edge === "right") && "top-0 bottom-0 w-1.5",
            edge === "left" && "left-0 cursor-ew-resize",
            edge === "right" && "right-0 cursor-ew-resize",
            (edge === "top" || edge === "bottom") && "left-0 right-0 h-1.5",
            edge === "top" && "top-0 cursor-ns-resize",
            edge === "bottom" && "bottom-0 cursor-ns-resize",
            activeEdge === edge && "bg-primary"
          )}
        />
      ))}
    </div>
  )
}
