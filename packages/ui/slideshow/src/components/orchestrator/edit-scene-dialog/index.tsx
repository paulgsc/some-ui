import type { JSX } from "react"
import { LibraryTemplatePicker } from "@slideshow/components/orchestrator/library-picker"
import { SceneSelectorTab } from "@slideshow/components/orchestrator/scene-selector"
import type { EditorAction, EditorState } from "@slideshow/utils/scene-editor"
import {
  buildSceneFromDraft,
  getEditorView,
} from "@slideshow/utils/scene-editor"
import { createSceneInstance } from "@slideshow/utils/scene-selector"
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@some-ui/shared"
import type { SceneConfig } from "@some-ui/types"
import {
  AlertCircle,
  Clock,
  Code,
  Layers,
  Library as LibraryIcon,
  Save,
} from "lucide-react"
import { cn } from "some-ui-utils"

type EditSceneDialogProps = {
  state: EditorState
  dispatch: (action: EditorAction) => void
  onSaveEdit?: (sceneIndex: number, scene: SceneConfig) => void
  onBulkAdd?: (scenes: Array<SceneConfig>) => void
}

export const EditSceneDialog = ({
  state,
  dispatch,
  onSaveEdit,
  onBulkAdd,
}: EditSceneDialogProps): JSX.Element => {
  const view = getEditorView(state)

  const handleSaveEdit = (): void => {
    if (state.type !== "EditingExisting") return

    const result = buildSceneFromDraft(state)
    if ("error" in result) {
      dispatch({ type: "SET_JSON_ERROR", error: result.error })
      return
    }

    onSaveEdit?.(state.sceneIndex, result)
    dispatch({ type: "CLOSE" })
  }

  const handleApplyLibrary = (): void => {
    if (state.type !== "SelectingFromLibrary") return

    const scenesToAdd: Array<SceneConfig> = state.selections
      .map((selection) => {
        if (!selection.sourceConfig) return null
        return createSceneInstance(selection.sourceConfig, selection)
      })
      .filter((s): s is SceneConfig => s !== null)

    onBulkAdd?.(scenesToAdd)
    dispatch({ type: "CLOSE" })
  }

  const handleClose = (): void => {
    dispatch({ type: "CLOSE" })
  }

  return (
    <Dialog open={view.isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[900px] h-[85vh] flex flex-col p-0 overflow-hidden bg-card">
        <DialogHeader className="p-6 pb-2 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              {view.mode === "edit"
                ? "Scene Orchestrator"
                : "Add from Scene Library"}
            </DialogTitle>
            {view.mode === "edit" && view.draft && (
              <Badge variant="outline" className="font-mono text-[10px]">
                REV_{view.draft.durationSec}s
              </Badge>
            )}
          </div>
        </DialogHeader>

        {view.mode === "edit" && (
          <EditModeContent state={state} dispatch={dispatch} />
        )}
        {view.mode === "library" && (
          <LibraryModeContent state={state} dispatch={dispatch} />
        )}

        <DialogFooter className="p-6 bg-muted/10 border-t gap-3">
          <Button variant="ghost" onClick={handleClose}>
            {view.mode === "library" ? "Cancel" : "Discard"}
          </Button>

          {view.mode === "edit" && (
            <Button
              onClick={handleSaveEdit}
              disabled={!view.canSave}
              className="gap-2"
            >
              <Save className="w-4 h-4" />
              Sync to Timeline
            </Button>
          )}

          {view.mode === "library" && (
            <Button
              onClick={handleApplyLibrary}
              disabled={!view.canSave}
              className="gap-2"
            >
              <Save className="w-4 h-4" />
              Add {view.selections.length} Scene
              {view.selections.length !== 1 && "s"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const EditModeContent = ({
  state,
  dispatch,
}: {
  state: EditorState
  dispatch: (action: EditorAction) => void
}): JSX.Element | null => {
  if (state.type !== "EditingExisting") return null
  const { draft } = state

  return (
    <Tabs defaultValue="layout" className="flex-1 flex flex-col min-h-0">
      <div className="px-6 pt-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="layout" className="gap-2">
            <Code className="w-4 h-4" /> Rich Intent Editor
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2">
            <Clock className="w-4 h-4" /> Timeline Config
          </TabsTrigger>
          <TabsTrigger value="library" className="gap-2">
            <LibraryIcon className="w-4 h-4" /> Import Template
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent
        value="layout"
        className="flex-1 flex flex-col min-h-0 p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h4 className="text-sm font-semibold">Intent Stack</h4>
          </div>
          {draft.jsonError && (
            <Badge variant="destructive" className="animate-pulse gap-1">
              <AlertCircle className="w-3 h-3" /> Syntax Error
            </Badge>
          )}
        </div>
        <div className="flex-1 relative font-mono text-sm">
          <Textarea
            value={draft.uiJson}
            onChange={(e) =>
              dispatch({ type: "UPDATE_DRAFT_JSON", value: e.target.value })
            }
            className={cn(
              "h-full min-h-full resize-none bg-muted text-foreground p-4 border-2 transition-colors",
              draft.jsonError ? "border-destructive/50" : "border-border"
            )}
            spellCheck={false}
          />
        </div>
      </TabsContent>

      <TabsContent value="config" className="p-6 space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>Scene Display Name</Label>
            <Input
              value={draft.sceneName}
              onChange={(e) =>
                dispatch({ type: "UPDATE_DRAFT_NAME", value: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Total Duration (Seconds)</Label>
            <Input
              type="number"
              value={draft.durationSec}
              onChange={(e) =>
                dispatch({
                  type: "UPDATE_DRAFT_DURATION",
                  value: Number(e.target.value),
                })
              }
            />
          </div>
        </div>
      </TabsContent>

      <TabsContent value="library" className="p-6">
        <LibraryTemplatePicker
          onSelectTemplate={(ui, templateName) => {
            dispatch({
              type: "REPLACE_DRAFT_UI_FROM_LIBRARY",
              ui,
              templateName,
            })
          }}
        />
      </TabsContent>
    </Tabs>
  )
}

const LibraryModeContent = ({
  state,
  dispatch,
}: {
  state: EditorState
  dispatch: (action: EditorAction) => void
}): JSX.Element | null => {
  if (state.type !== "SelectingFromLibrary") return null

  return (
    <div className="flex-1 flex flex-col min-h-0 p-6">
      <SceneSelectorTab
        selections={state.selections}
        onSelectionsChange={(selections) =>
          dispatch({ type: "SET_LIBRARY_SELECTIONS", selections })
        }
        maxPerScene={10}
      />
    </div>
  )
}
