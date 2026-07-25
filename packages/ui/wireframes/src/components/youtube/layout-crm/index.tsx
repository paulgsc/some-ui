import type { JSX } from "react"
import { useEffect, useRef, useState } from "react"
import type { SlotId } from "@some-ui/types"
import { LayoutNodeRenderer } from "@wireframes/components/editor-layout-renderer"
import { TreeVisualizer } from "@wireframes/components/tree-visualizer"
import {
  applyIntent,
  extractLeafIds,
  type LayoutIntent,
} from "@wireframes/lib/layout-intent"
import type { LayoutNode } from "@wireframes/lib/layout-weighted"
import { solveLayout } from "@wireframes/lib/layout-weighted"
import { serializeLayout } from "@wireframes/lib/tree-serialization"
import {
  ALL_YOUTUBE_REGIONS,
  regionColors,
} from "@wireframes/lib/youtube-config"
import {
  Check,
  Code,
  Copy,
  Download,
  Play,
  Plus,
  RotateCcw,
} from "lucide-react"
import { Button, Card } from "some-ui-shared"
import { cn } from "some-ui-utils"
import { toast } from "sonner"

export const LayoutEditor = (): JSX.Element => {
  const [tree, setTree] = useState<LayoutNode<SlotId> | null>(null)
  const [selectedLeaf, setSelectedLeaf] = useState<SlotId | null>(null)
  const [showCode, setShowCode] = useState(false)
  const [copied, setCopied] = useState(false)
  const [canvasDropEdge, setCanvasDropEdge] = useState<
    "left" | "right" | "top" | "bottom" | null
  >(null)

  const lastResizeRef = useRef<{
    region: SlotId
    edge: string
    totalDelta: number
  } | null>(null)

  const viewport = { x: 0, y: 0, width: 800, height: 600 }

  const solved = tree ? solveLayout(tree, viewport) : null

  const usedRegions = extractLeafIds(tree)
  const availableRegions = ALL_YOUTUBE_REGIONS.filter(
    (region) => !usedRegions.has(region)
  )

  const handleIntent = (intent: LayoutIntent<SlotId>): void => {
    const newTree = applyIntent(tree, intent)
    setTree(newTree)
  }

  const handleRemove = (id: SlotId): void => {
    handleIntent({ kind: "remove", region: id })
    toast("Region removed", {
      description: `${id} has been removed from the layout`,
    })
  }

  const handlePlaceIntent = (
    region: SlotId,
    relativeTo: SlotId,
    edge: "left" | "right" | "top" | "bottom"
  ): void => {
    handleIntent({
      kind: "place",
      region,
      relativeTo,
      edge,
    })
    toast("Region placed", {
      description: `${region} placed ${edge} of ${relativeTo}`,
    })
  }

  const handleCanvasDragOver = (e: React.DragEvent): void => {
    e.preventDefault()

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Detect if dragging near canvas edges (not over any panel)
    const edgeThreshold = 40 // Pixels from edge

    if (x < edgeThreshold) {
      setCanvasDropEdge("left")
    } else if (x > rect.width - edgeThreshold) {
      setCanvasDropEdge("right")
    } else if (y < edgeThreshold) {
      setCanvasDropEdge("top")
    } else if (y > rect.height - edgeThreshold) {
      setCanvasDropEdge("bottom")
    } else {
      setCanvasDropEdge(null)
    }
  }

  const handleCanvasDrop = (e: React.DragEvent): void => {
    e.preventDefault()

    const draggedRegion: SlotId | undefined =
      e.dataTransfer.getData("text/plain") || undefined

    if (draggedRegion && canvasDropEdge) {
      // Place relative to root (entire tree)
      if (usedRegions.has(draggedRegion)) {
        handleIntent({
          kind: "move",
          region: draggedRegion,
          relativeTo: "root",
          edge: canvasDropEdge,
        })
      } else {
        handleIntent({
          kind: "place",
          region: draggedRegion,
          relativeTo: "root",
          edge: canvasDropEdge,
        })
      }

      toast("Region placed", {
        description: `${draggedRegion} placed at canvas ${canvasDropEdge} edge`,
      })
    }

    setCanvasDropEdge(null)
  }

  const handleMoveIntent = (
    region: SlotId,
    relativeTo: SlotId,
    edge: "left" | "right" | "top" | "bottom"
  ): void => {
    handleIntent({
      kind: "move",
      region,
      relativeTo,
      edge,
    })
    toast("Region moved", {
      description: `${region} moved ${edge} of ${relativeTo}`,
    })
  }

  const handleResizeIntent = (
    region: SlotId,
    edge: "left" | "right" | "top" | "bottom",
    deltaPx: number,
    containerSizePx: number
  ): void => {
    handleIntent({
      kind: "resize",
      region,
      edge,
      deltaPx,
      containerSizePx,
    })
  }

  const handleAddToEmptyCanvas = (region: SlotId): void => {
    handleIntent({
      kind: "place",
      region,
      edge: "left", // Doesn't matter for first region
    })
    toast("Region added", {
      description: `${region} has been added to the canvas`,
    })
  }

  const handleReset = (): void => {
    setTree(null)
    setSelectedLeaf(null)
  }

  const handleExportJSON = (): void => {
    if (!tree) {
      toast.error("Nothing to export", {
        description: "Add some regions to the canvas first",
      })
      return
    }

    const json = serializeLayout(tree)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "layout-tree.json"
    a.click()
    URL.revokeObjectURL(url)
    toast("JSON exported", {
      description: "Layout tree has been downloaded",
    })
  }

  async function copyText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }

  const handleCopyJSON = async (): Promise<void> => {
    if (!tree) {
      toast.error("Nothing to copy", {
        description: "Add some regions to the canvas first",
      })
      return
    }

    const json = serializeLayout(tree)
    const ok = await copyText(json)

    if (!ok) {
      toast.error("Copy failed", {
        description: "Clipboard is not available in this environment",
      })
      return
    }

    setCopied(true)
    setTimeout(() => setCopied(false), 2000)

    toast("Copied to clipboard", {
      description: "JSON has been copied to your clipboard",
    })
  }

  useEffect(() => {
    const handleMouseUp = (): void => {
      lastResizeRef.current = null
    }

    window.addEventListener("mouseup", handleMouseUp)
    return (): void => window.removeEventListener("mouseup", handleMouseUp)
  }, [])

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-balance">
              Layout Constructor
            </h1>
            <p className="text-muted-foreground text-pretty mt-1">
              Build layouts by placing regions spatially. Drag to reposition,
              resize at edges. Intent-based editing.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowCode(!showCode)}>
              <Code className="h-4 w-4 mr-2" />
              {showCode ? "Hide" : "Show"} Code
            </Button>
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_400px] gap-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Canvas Preview</h2>
              <div className="flex items-center gap-2">
                <Play className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {viewport.width} × {viewport.height}
                </span>
              </div>
            </div>
            <div
              data-viewport
              className="relative bg-muted/30 border-2 border-dashed border-border rounded-lg mx-auto"
              style={{
                width: viewport.width,
                height: viewport.height,
              }}
              onDragOver={handleCanvasDragOver}
              onDragLeave={() => setCanvasDropEdge(null)}
              onDrop={handleCanvasDrop}
            >
              {!solved ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <p className="text-muted-foreground">
                      Empty canvas. Click a region below to start.
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center max-w-md">
                      {availableRegions.map((region) => (
                        <Button
                          key={region}
                          variant="outline"
                          size="sm"
                          className={cn(
                            "font-mono text-xs",
                            regionColors[region]
                          )}
                          onClick={() => handleAddToEmptyCanvas(region)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          {region}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <LayoutNodeRenderer
                  node={solved}
                  onLeafClick={setSelectedLeaf}
                  selectedLeaf={selectedLeaf}
                  onRemove={handleRemove}
                  onPlaceIntent={handlePlaceIntent}
                  onMoveIntent={handleMoveIntent}
                  onResizeIntent={handleResizeIntent}
                  existingRegions={usedRegions}
                />
              )}
            </div>
          </Card>

          <div className="space-y-6">
            {availableRegions.length > 0 && tree && (
              <Card className="p-6 bg-accent/50">
                <h2 className="text-lg font-semibold mb-4">
                  Available Regions
                </h2>
                <p className="text-sm text-muted-foreground mb-3">
                  Drag these onto the canvas edges to add them
                </p>
                <div className="flex flex-wrap gap-2">
                  {availableRegions.map((region) => (
                    <div
                      key={region}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move"
                        e.dataTransfer.setData("text/plain", region)
                      }}
                      className={cn(
                        "px-3 py-2 rounded-md border-2 cursor-move font-mono text-xs font-medium transition-all hover:scale-105 hover:shadow-md",
                        regionColors[region]
                      )}
                    >
                      {region}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {tree && (
              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4">Tree Structure</h2>
                <p className="text-sm text-muted-foreground mb-3">
                  Topology + Geometry (read-only)
                </p>
                <div className="max-h-[400px] overflow-auto">
                  <TreeVisualizer
                    tree={tree}
                    onToggleAxis={() => {}}
                    selectedLeaf={selectedLeaf}
                  />
                </div>
              </Card>
            )}

            {tree && (
              <Card className="p-6 bg-accent/50">
                <h3 className="font-semibold mb-3">Export Options</h3>
                <div className="space-y-2">
                  <Button
                    variant="secondary"
                    className="w-full justify-start"
                    onClick={handleExportJSON}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download JSON
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full justify-start"
                    onClick={handleCopyJSON}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 mr-2" />
                    ) : (
                      <Copy className="h-4 w-4 mr-2" />
                    )}
                    {copied ? "Copied!" : "Copy JSON"}
                  </Button>
                </div>
              </Card>
            )}

            <Card className="p-6 bg-primary/5 border-primary/20">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                How to use
              </h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span>Start by clicking a region to add to empty canvas</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span>Drag available regions to canvas edges</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span>Drag existing panels to reposition them</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span>
                    Hover panel edges to resize (mutates geometry only)
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span>
                    Tree structure is derived from your spatial intent
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span>Export to JSON when done</span>
                </li>
              </ul>
            </Card>
          </div>
        </div>

        {showCode && tree && (
          <Card className="p-6 bg-muted/50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Serialized Layout JSON</h2>
              <Button variant="ghost" size="sm" onClick={handleCopyJSON}>
                {copied ? (
                  <Check className="h-4 w-4 mr-2" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <pre className="text-xs font-mono overflow-auto bg-background p-4 rounded-lg border max-h-[400px]">
              {serializeLayout(tree)}
            </pre>
          </Card>
        )}
      </div>
    </div>
  )
}
