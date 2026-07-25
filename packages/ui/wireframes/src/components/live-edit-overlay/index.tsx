import type { JSX } from "react"
import { useState } from "react"
import type { SlotId } from "@some-ui/types"
import { LayoutNodeRenderer } from "@wireframes/components/editor-layout-renderer"
import { useContainerRect } from "@wireframes/hooks/use-container-rect"
import type { LayoutIntent } from "@wireframes/lib/layout-intent"
import { applyIntent, extractLeafIds } from "@wireframes/lib/layout-intent"
import type { LayoutNode } from "@wireframes/lib/layout-weighted"
import { solveLayout } from "@wireframes/lib/layout-weighted"
import { Plus } from "lucide-react"
import { Button, Input } from "some-ui-shared"

export type BindOption = { value: string; label: string }

type LiveEditOverlayProps = {
  tree: LayoutNode<SlotId> | null
  onTreeChange: (tree: LayoutNode<SlotId> | null) => void
  /** Leaves that already have real content bound - these don't get a "Bind" control. */
  boundLeafIds: Set<SlotId>
  bindOptions: ReadonlyArray<BindOption>
  onBind: (leafId: SlotId, registryKey: string) => void
}

/**
 * Structural + binding edit affordances for a session's live layout tree,
 * meant to be stacked on top of the real, already-rendered viewport (see
 * `getSlotColor`'s overlay-mode translucency in the renderer it wraps).
 */
export const LiveEditOverlay = ({
  tree,
  onTreeChange,
  boundLeafIds,
  bindOptions,
  onBind,
}: LiveEditOverlayProps): JSX.Element => {
  const { ref, rect } = useContainerRect()
  const [newLeafName, setNewLeafName] = useState("")

  const existingRegions = extractLeafIds(tree)
  const solved = tree && rect ? solveLayout(tree, rect) : null

  const handleIntent = (intent: LayoutIntent<SlotId>): void => {
    onTreeChange(applyIntent(tree, intent))
  }

  const handleAddLeaf = (): void => {
    const name = newLeafName.trim()
    if (!name) return
    handleIntent({ kind: "place", region: name, edge: "right" })
    setNewLeafName("")
  }

  return (
    <div ref={ref} className="absolute inset-0 z-40">
      {solved && (
        <LayoutNodeRenderer
          node={solved}
          overlay
          existingRegions={existingRegions}
          onRemove={(id) => handleIntent({ kind: "remove", region: id })}
          onPlaceIntent={(region, relativeTo, edge) =>
            handleIntent({ kind: "place", region, relativeTo, edge })
          }
          onMoveIntent={(region, relativeTo, edge) =>
            handleIntent({ kind: "move", region, relativeTo, edge })
          }
          onResizeIntent={(region, edge, deltaPx, containerSizePx) =>
            handleIntent({
              kind: "resize",
              region,
              edge,
              deltaPx,
              containerSizePx,
            })
          }
          renderLeafExtra={(id) =>
            boundLeafIds.has(id) ? null : (
              <select
                className="pointer-events-auto absolute bottom-1 left-1 right-1 z-10 rounded border bg-background/90 px-1 py-0.5 text-xs text-foreground"
                defaultValue=""
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  if (e.target.value) onBind(id, e.target.value)
                }}
              >
                <option value="" disabled>
                  Bind…
                </option>
                {bindOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )
          }
        />
      )}

      <div className="pointer-events-auto absolute bottom-3 left-3 z-50 flex items-center gap-2 rounded-md border bg-background/95 p-2 shadow-md">
        <Input
          value={newLeafName}
          onChange={(e) => setNewLeafName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAddLeaf()
          }}
          placeholder="New leaf name"
          className="h-8 w-40 text-xs"
        />
        <Button
          size="sm"
          onClick={handleAddLeaf}
          disabled={!newLeafName.trim()}
        >
          <Plus className="mr-1 size-3.5" />
          Add
        </Button>
      </div>
    </div>
  )
}
