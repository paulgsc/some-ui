import type { JSX } from "react"
import type { LayoutNode } from "@wireframes/lib/layout-weighted"
import type { YouTubeRegion } from "@wireframes/lib/youtube-config"
import { ChevronRight, Columns2, Rows2 } from "lucide-react"
import { cn } from "some-ui-utils"

type TreeVisualizerProps = {
  tree: LayoutNode<YouTubeRegion>
  onToggleAxis?: (splitId: string) => void
  selectedLeaf?: YouTubeRegion | null
}

export const TreeVisualizer = ({
  tree,
  selectedLeaf,
}: TreeVisualizerProps): JSX.Element => {
  return (
    <div className="space-y-1">
      <TreeNode node={tree} depth={0} selectedLeaf={selectedLeaf} />
    </div>
  )
}

const TreeNode = ({
  node,
  depth,
  selectedLeaf,
}: {
  node: LayoutNode<YouTubeRegion>
  depth: number
  selectedLeaf?: YouTubeRegion | null
}): JSX.Element => {
  if (node.type === "leaf") {
    const isSelected = selectedLeaf === node.id
    return (
      <div
        className={cn(
          "flex items-center gap-2 py-1 px-2 rounded-md text-sm font-mono",
          "hover:bg-accent transition-colors",
          isSelected && "bg-accent ring-1 ring-ring"
        )}
        style={{ marginLeft: depth * 16 }}
      >
        <ChevronRight className="h-3 w-3 text-muted-foreground" />
        <span className="text-foreground">{node.id}</span>
      </div>
    )
  }

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1 px-2 rounded-md hover:bg-muted transition-colors"
        style={{ marginLeft: depth * 16 }}
      >
        {node.axis === "row" ? (
          <Rows2 className="h-3 w-3 text-muted-foreground" />
        ) : (
          <Columns2 className="h-3 w-3 text-muted-foreground" />
        )}
        <span className="text-sm font-mono text-muted-foreground">
          {node.splitId}
        </span>
        <span className="text-xs text-muted-foreground ml-auto">(derived)</span>
      </div>
      {node.children.map(({ node: child, weight }) => (
        <div
          key={child.type === "leaf" ? child.id : child.splitId}
          className="relative"
        >
          <TreeNode
            node={child}
            depth={depth + 1}
            selectedLeaf={selectedLeaf}
          />
          <span className="absolute right-2 top-1 text-xs text-muted-foreground/60 font-mono">
            w:{weight.toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  )
}
