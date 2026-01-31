import { useRef, useState } from "react"
import type { SolvedNode } from "@wireframes/lib/layout-types"
import type { YouTubeRegion } from "@wireframes/lib/youtube-config"
import { regionColors } from "@wireframes/lib/youtube-config"
import { X } from "lucide-react"
import { cn } from "some-ui-utils"

type LayoutNodeRendererProps = {
  node: SolvedNode<YouTubeRegion>
  onLeafClick?: (id: YouTubeRegion) => void
  selectedLeaf?: YouTubeRegion | null
  onRemove?: (id: YouTubeRegion) => void
  onPlaceIntent?: (
    region: YouTubeRegion,
    relativeTo: YouTubeRegion,
    edge: "left" | "right" | "top" | "bottom"
  ) => void
  onMoveIntent?: (
    region: YouTubeRegion,
    relativeTo: YouTubeRegion,
    edge: "left" | "right" | "top" | "bottom"
  ) => void
  onResizeIntent?: (
    region: YouTubeRegion,
    edge: "left" | "right" | "top" | "bottom",
    deltaPx: number,
    containerSizePx: number
  ) => void
  existingRegions?: Set<YouTubeRegion>
}

export const LayoutNodeRenderer = ({
  node,
  onLeafClick,
  selectedLeaf,
  onRemove,
  onPlaceIntent,
  onMoveIntent,
  onResizeIntent,
  existingRegions = new Set(),
}: LayoutNodeRendererProps) => {
  const [isHovered, setIsHovered] = useState(false)
  const [draggedOver, setDraggedOver] = useState<
    "left" | "right" | "top" | "bottom" | null
  >(null)
  const [resizeEdge, setResizeEdge] = useState<
    "left" | "right" | "top" | "bottom" | null
  >(null)
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartRef = useRef<{
    startX: number
    startY: number
    edge: "left" | "right" | "top" | "bottom"
  } | null>(null)

  if (node.type === "leaf") {
    const isSelected = selectedLeaf === node.id

    const handleDragOver = (e: React.DragEvent): void => {
      e.preventDefault()
      e.stopPropagation()

      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const width = rect.width
      const height = rect.height

      const threshold = 0.3

      if (x < width * threshold) {
        setDraggedOver("left")
      } else if (x > width * (1 - threshold)) {
        setDraggedOver("right")
      } else if (y < height * threshold) {
        setDraggedOver("top")
      } else if (y > height * (1 - threshold)) {
        setDraggedOver("bottom")
      } else {
        setDraggedOver(null)
      }
    }

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const draggedRegion = e.dataTransfer.getData(
        "text/plain"
      ) as YouTubeRegion

      if (draggedRegion && draggedRegion !== node.id && draggedOver) {
        if (existingRegions.has(draggedRegion)) {
          onMoveIntent(draggedRegion, node.id, draggedOver)
        } else {
          onPlaceIntent(draggedRegion, node.id, draggedOver)
        }
      }

      setDraggedOver(null)
    }

    const handleMouseMove = (e: React.MouseEvent) => {
      if (isResizing) return // Don't update hover during resize

      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const edgeThreshold = 10 // Increased from 8 for easier grabbing

      if (x < edgeThreshold) {
        setResizeEdge("left")
      } else if (x > rect.width - edgeThreshold) {
        setResizeEdge("right")
      } else if (y < edgeThreshold) {
        setResizeEdge("top")
      } else if (y > rect.height - edgeThreshold) {
        setResizeEdge("bottom")
      } else {
        setResizeEdge(null)
      }
    }

    const handleMouseDown = (e: React.MouseEvent) => {
      if (!resizeEdge || !onResizeIntent) return

      e.preventDefault()
      e.stopPropagation()

      setIsResizing(true)

      // CAPTURE STABLE VALUES AT START
      const startX = e.clientX
      const startY = e.clientY
      const edge = resizeEdge
      const isHorizontal = edge === "left" || edge === "right"

      // Use the node's current solved rect as the stable reference
      const stableContainerSize = isHorizontal
        ? node.rect.width
        : node.rect.height

      const handleGlobalMouseMove = (moveEvent: MouseEvent): void => {
        const currentPos = isHorizontal ? moveEvent.clientX : moveEvent.clientY
        const startPos = isHorizontal ? startX : startY
        const delta = currentPos - startPos

        // Pass the stable size captured at the start of the drag
        onResizeIntent(node.id, edge, delta, stableContainerSize)
      }

      const handleGlobalMouseUp = () => {
        setIsResizing(false)
        window.removeEventListener("mousemove", handleGlobalMouseMove)
        window.removeEventListener("mouseup", handleGlobalMouseUp)
      }

      window.addEventListener("mousemove", handleGlobalMouseMove)
      window.addEventListener("mouseup", handleGlobalMouseUp)
    }

    const getCursorStyle = () => {
      if (isResizing) {
        const edge = resizeStartRef.current?.edge
        if (edge === "left" || edge === "right") return "ew-resize"
        if (edge === "top" || edge === "bottom") return "ns-resize"
      }
      if (resizeEdge === "left" || resizeEdge === "right") return "ew-resize"
      if (resizeEdge === "top" || resizeEdge === "bottom") return "ns-resize"
      return "move"
    }

    return (
      <div
        className={cn(
          "absolute border-2 transition-all group",
          regionColors[node.id],
          "flex items-center justify-center",
          "text-foreground font-mono text-xs font-medium",
          isSelected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
          draggedOver && "ring-4 ring-primary",
          isResizing && "select-none"
        )}
        style={{
          left: node.rect.x,
          top: node.rect.y,
          width: node.rect.width,
          height: node.rect.height,
          cursor: getCursorStyle(),
        }}
        onClick={() => onLeafClick(node.id)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          if (!isResizing) {
            setIsHovered(false)
            setResizeEdge(null)
          }
        }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        draggable={!resizeEdge && !isResizing}
        onDragStart={(e) => {
          if (resizeEdge || isResizing) {
            e.preventDefault()
            return
          }
          e.dataTransfer.effectAllowed = "move"
          e.dataTransfer.setData("text/plain", node.id)
        }}
        onDragOver={handleDragOver}
        onDragLeave={() => setDraggedOver(null)}
        onDrop={handleDrop}
      >
        {draggedOver && (
          <div
            className={cn(
              "absolute bg-primary/20 border-2 border-primary border-dashed transition-all pointer-events-none",
              draggedOver === "left" && "left-0 top-0 bottom-0 w-1/3",
              draggedOver === "right" && "right-0 top-0 bottom-0 w-1/3",
              draggedOver === "top" && "left-0 right-0 top-0 h-1/3",
              draggedOver === "bottom" && "left-0 right-0 bottom-0 h-1/3"
            )}
          />
        )}

        <span className="drop-shadow-sm relative z-10 pointer-events-none">
          {node.id}
        </span>

        {isHovered && onRemove && !isResizing && (
          <button
            className="absolute top-1 right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:scale-110 transition-transform shadow-md z-20"
            onClick={(e) => {
              e.stopPropagation()
              onRemove(node.id)
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <X className="h-3 w-3" />
          </button>
        )}

        {/* Visual resize handles (optional, for clarity) */}
        {resizeEdge && !isResizing && (
          <div
            className={cn(
              "absolute bg-primary/50 z-30 pointer-events-none",
              resizeEdge === "left" && "left-0 top-0 bottom-0 w-0.5",
              resizeEdge === "right" && "right-0 top-0 bottom-0 w-0.5",
              resizeEdge === "top" && "left-0 right-0 top-0 h-0.5",
              resizeEdge === "bottom" && "left-0 right-0 bottom-0 h-0.5"
            )}
          />
        )}
      </div>
    )
  }

  return (
    <>
      {node.children.map((child, i) => (
        <LayoutNodeRenderer
          key={i}
          node={child}
          onLeafClick={onLeafClick}
          selectedLeaf={selectedLeaf}
          onRemove={onRemove}
          onPlaceIntent={onPlaceIntent}
          onMoveIntent={onMoveIntent}
          onResizeIntent={onResizeIntent}
          existingRegions={existingRegions}
        />
      ))}
    </>
  )
}
