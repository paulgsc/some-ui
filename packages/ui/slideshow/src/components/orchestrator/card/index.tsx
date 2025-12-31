import { useState } from "react"
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
import { Plus } from "lucide-react"
import type { SceneConfig, TimeMs } from "some-types-utils"
import { Button, Card } from "some-ui-shared"

export const OrchestratorDemo = ({
  initialScenes = [],
}: {
  initialScenes?: Array<SceneConfig>
}) => {
  const [scenes, setScenes] = useState<Array<SceneConfig>>(initialScenes)
  const [editingScene, setEditingScene] = useState<{
    scene: SceneConfig
    index: number
  } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  /**
   * Helper to recalculate start times based on durations
   * Essential since your new type schema includes start_time
   */
  const recalculateTimeline = (
    updatedScenes: Array<SceneConfig>
  ): Array<SceneConfig> => {
    let currentAccumulator: TimeMs = 0
    return updatedScenes.map((scene) => {
      const sceneWithStart = { ...scene, start_time: currentAccumulator }
      currentAccumulator += scene.duration
      return sceneWithStart
    })
  }

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      setScenes((items) => {
        const oldIndex = items.findIndex((_, i) => `scene-${i}` === active.id)
        const newIndex = items.findIndex((_, i) => `scene-${i}` === over.id)

        const movedArray = arrayMove(items, oldIndex, newIndex)
        return movedArray
      })
    }
  }

  const handleEditScene = (index: number): void => {
    setEditingScene({ scene: scenes[index], index })
  }

  const handleSaveScene = (updatedScene: SceneConfig): void => {
    if (editingScene === null) return

    const newScenes = [...scenes]
    newScenes[editingScene.index] = updatedScene
    setScenes(newScenes)
    setEditingScene(null)
  }

  const handleAddScene = (): void => {
    const newScene: SceneConfig = {
      scene_name: `New Scene ${scenes.length + 1}`,
      duration: 60_000, // 1 minute default
      start_time: 0,
      ui: [], // Initializing empty UI array as per UILayoutIntentSchema
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
              Manage {scenes.length} scenes and live streaming workflow
            </p>
          </div>
          <Button onClick={handleAddScene} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Scene
          </Button>
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
                  // Using index-based IDs for stability during renames
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

      <EditSceneDialog
        open={editingScene !== null}
        onOpenChange={(open) => !open && setEditingScene(null)}
        scene={editingScene?.scene ?? null}
        onSave={handleSaveScene}
      />
    </div>
  )
}
