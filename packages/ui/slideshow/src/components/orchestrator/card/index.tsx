import { useReducer, useState } from "react"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import {
  ActiveLifetimesPanel,
  EditSceneDialog,
  OrchestratorControls,
  OrchestratorTimeline,
} from "@slideshow/components/orchestrator"
import type { EditorState } from "@slideshow/utils/scene-editor"
import { editorReducer } from "@slideshow/utils/scene-editor"
import { Library, Plus } from "lucide-react"
import type { SceneConfig } from "some-types-utils"
import { Button, Card } from "some-ui-shared"

export const OrchestratorDemo = ({
  initialScenes = [],
}: {
  initialScenes?: Array<SceneConfig>
}) => {
  const [scenes, setScenes] = useState<Array<SceneConfig>>(initialScenes)

  // FSM for dialog state - single source of truth
  const [editorState, dispatchEditor] = useReducer<
    (state: EditorState, action: any) => EditorState
  >(editorReducer, { type: "Closed" })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setScenes((items) => {
        const oldIndex = items.findIndex((_, i) => `scene-${i}` === active.id)
        const newIndex = items.findIndex((_, i) => `scene-${i}` === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  // FSM Transition: Open for editing existing scene
  const handleEditScene = (index: number): void => {
    dispatchEditor({
      type: "OPEN_FOR_EDIT",
      sceneIndex: index,
      scene: scenes[index],
    })
  }

  // FSM Transition: Save edited scene
  const handleSaveEdit = (
    sceneIndex: number,
    updatedScene: SceneConfig
  ): void => {
    setScenes((current) => {
      const updated = [...current]
      updated[sceneIndex] = updatedScene
      return updated
    })
  }

  // FSM Transition: Open library dialog
  const handleOpenLibrary = (): void => {
    dispatchEditor({ type: "OPEN_FOR_LIBRARY_ADD" })
  }

  // FSM Transition: Bulk add from library
  const handleBulkAdd = (newScenes: Array<SceneConfig>): void => {
    setScenes((current) => [...current, ...newScenes])
  }

  // Manual scene creation
  const handleCreateNew = (): void => {
    const newScene: SceneConfig = {
      scene_name: `New Scene ${scenes.length + 1}`,
      duration: 60_000,
      start_time: 0,
      ui: [],
    }
    setScenes([...scenes, newScene])
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Orchestrator Control
            </h1>
            <p className="text-muted-foreground">
              Manage {scenes.length} scenes • FSM-based state management
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleOpenLibrary}
              variant="outline"
              className="gap-2"
            >
              <Library className="h-4 w-4" />
              Add from Library
            </Button>
            <Button onClick={handleCreateNew} className="gap-2">
              <Plus className="h-4 w-4" />
              New Scene
            </Button>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <OrchestratorControls scenes={scenes} />
            <Card className="p-6">
              <h2 className="mb-4 text-lg font-semibold">Scene Timeline</h2>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={scenes.map((_, i) => `scene-${i}`)}
                  strategy={verticalListSortingStrategy}
                >
                  <OrchestratorTimeline
                    scenes={scenes}
                    onEditScene={handleEditScene}
                  />
                </SortableContext>
              </DndContext>
            </Card>
          </div>
          <div className="lg:col-span-1">
            <ActiveLifetimesPanel />
          </div>
        </div>
      </div>

      {/* Single Dialog - FSM controls all modes */}
      <EditSceneDialog
        state={editorState}
        dispatch={dispatchEditor}
        onSaveEdit={handleSaveEdit}
        onBulkAdd={handleBulkAdd}
      />
    </div>
  )
}
