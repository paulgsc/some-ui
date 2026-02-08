import type { JSX } from "react"
import { useState } from "react"
import type { SceneFileName } from "@slideshow/hooks/use-scene-library"
import { useSceneLibrary } from "@slideshow/hooks/use-scene-library"
import type { SceneSelection } from "@slideshow/utils/scene-selector"
import {
  countSceneOccurrences,
  generateSelectionId,
  getNextInstanceIndex,
  validateSelections,
} from "@slideshow/utils/scene-selector"
import { AlertCircle, Check, Copy, Library, Plus, Trash2 } from "lucide-react"
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  ScrollArea,
} from "some-ui-shared"
import { cn } from "some-ui-utils"

type SceneSelectorTabProps = {
  selections: Array<SceneSelection>
  onSelectionsChange: (selections: Array<SceneSelection>) => void
  maxTotal?: number
  maxPerScene?: number
}

export const SceneSelectorTab = ({
  selections,
  onSelectionsChange,
  maxTotal,
  maxPerScene,
}: SceneSelectorTabProps): JSX.Element => {
  const { getLibraryItems, loading, error } = useSceneLibrary()
  const [expandedFile, setExpandedFile] = useState<SceneFileName | null>(null)

  const libraryItems = getLibraryItems()
  const occurrences = countSceneOccurrences(selections)
  const validation = validateSelections(selections, { maxTotal, maxPerScene })

  const handleAddScene = (fileName: SceneFileName): void => {
    const instanceIndex = getNextInstanceIndex(selections, fileName)
    const sourceConfig = libraryItems.find(
      (item) => item.fileName === fileName
    )?.config
    if (!sourceConfig) return
    const newSelection: SceneSelection = {
      id: generateSelectionId(fileName, instanceIndex),
      fileName,
      instanceIndex,
      sourceConfig,
    }
    onSelectionsChange([...selections, newSelection])
  }

  const handleRemoveSelection = (id: string): void => {
    const filtered = selections.filter((s) => s.id !== id)
    const removed = selections.find((s) => s.id === id)
    if (removed) {
      const renumbered = filtered.map((sel) =>
        sel.fileName === removed.fileName &&
        sel.instanceIndex > removed.instanceIndex
          ? { ...sel, instanceIndex: sel.instanceIndex - 1 }
          : sel
      )
      onSelectionsChange(renumbered)
    } else {
      onSelectionsChange(filtered)
    }
  }

  const handleClearAll = (): void => onSelectionsChange([])

  if (loading)
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Library className="w-5 h-5 mr-2 animate-pulse" />
        Loading scene library...
      </div>
    )

  if (error)
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {/* Validation Errors */}
      {!validation.valid && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {validation.errors.map((err, i) => (
                <li key={i} className="text-xs">
                  {err}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Panels */}
      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
        {/* Library Panel */}
        <Card className="flex flex-col h-full min-h-0 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Library className="w-4 h-4" /> Scene Library
            </h4>
            <Badge variant="outline" className="text-xs">
              {libraryItems.length} available
            </Badge>
          </div>

          <ScrollArea className="flex-1 min-h-0 -mx-4 px-4">
            <div className="space-y-2">
              {libraryItems.map((item) => {
                const count = occurrences.get(item.fileName) || 0
                const canAdd = !maxPerScene || count < maxPerScene

                const toggleExpand = (): void => {
                  setExpandedFile(
                    expandedFile === item.fileName ? null : item.fileName
                  )
                }

                return (
                  <div
                    key={item.fileName}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "p-3 rounded-lg border-2 transition-all cursor-pointer hover:border-primary/50 text-left w-full",
                      expandedFile === item.fileName
                        ? "border-primary bg-primary/5"
                        : "border-border"
                    )}
                    onClick={toggleExpand}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        toggleExpand()
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {item.displayName}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">
                          {item.fileName}.json
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {count > 0 && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-5 px-1.5"
                          >
                            <Copy className="w-3 h-3 mr-0.5" />
                            {count}
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant={count > 0 ? "outline" : "default"}
                          className="h-7 px-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAddScene(item.fileName)
                          }}
                          disabled={!canAdd}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {expandedFile === item.fileName && (
                      <div className="mt-2 pt-2 border-t text-xs text-muted-foreground space-y-1">
                        <div>Duration: {item.config.duration / 1000}s</div>
                        <div>UI Intents: {item.config.ui.length || 0}</div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </Card>

        {/* Selection Panel */}
        <Card className="flex flex-col h-full min-h-0 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Check className="w-4 h-4" /> Selected Scenes
            </h4>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {selections.length} selected
              </Badge>
              {selections.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={handleClearAll}
                >
                  Clear All
                </Button>
              )}
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0 -mx-4 px-4">
            {selections.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-8">
                <Library className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No scenes selected</p>
                <p className="text-xs mt-1">
                  Add scenes from the library to build your timeline
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {selections.map((selection, index) => {
                  const item = libraryItems.find(
                    (li) => li.fileName === selection.fileName
                  )
                  if (!item) return null

                  return (
                    <div
                      key={selection.id}
                      className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Badge
                            variant="outline"
                            className="text-[10px] h-5 px-1.5 shrink-0"
                          >
                            #{index + 1}
                          </Badge>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm truncate">
                              {item.displayName}
                              {selection.instanceIndex > 0 && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  ({selection.instanceIndex + 1})
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {selection.fileName}
                            </div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemoveSelection(selection.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </Card>
      </div>
    </div>
  )
}
