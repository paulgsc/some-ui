import { useEffect, useState } from "react"
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
  EditSceneDialog,
  OrchestratorControls,
  OrchestratorTimeline,
  ScheduledElementsList,
} from "@slideshow/components/orchestrator"
import { Plus } from "lucide-react"
import type { SceneConfig } from "some-types-utils"
import { Button, Card } from "some-ui-shared"
import { useOrchestrator } from "some-ui-utils"

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

  const {
    parseErrors,
    isConnected,
    isReconnecting,
    state: {
      is_running,
      progress,
      current_time,
      total_duration,
      current_scene_index,
      scheduled_elements,
      stream_status: { timecode, is_streaming },
    },
    start,
    pause,
    resume,
    forceScene,
    stop,
    reset,
    skipCurrentScene,
  } = useOrchestrator({
    stream_id: "test",
    scenes,
    autoStart: false,
    onSceneChange: (from, to) => {
      console.log("[v0] Scene changed:", from, "→", to)
    },
    onError: (error) => {
      console.error("[v0] Orchestrator error:", error)
    },
  })

  useEffect(() => {
    if (parseErrors.length > 0) {
      const latestError = parseErrors[parseErrors.length - 1]
      console.error("Orchestrator Zod validation error:", latestError)
    }
  }, [parseErrors])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent): Array<SceneConfig> => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      setScenes((items) => {
        const oldIndex = items.findIndex(
          (item, i) => `${item.scene_name}-${i}` === active.id
        )
        const newIndex = items.findIndex(
          (item, i) => `${item.scene_name}-${i}` === over.id
        )

        return arrayMove(items, oldIndex, newIndex)
      })
    }
    return []
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
      duration: 60,
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
              Manage scenes, timeline, and live streaming workflow
            </p>
          </div>
          <Button onClick={handleAddScene} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Scene
          </Button>
        </div>

        {/* Main Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - Timeline & Controls */}
          <div className="space-y-6 lg:col-span-2">
            {/* Controls */}
            <OrchestratorControls
              isRunning={is_running}
              isConnected={isConnected}
              isReconnecting={isReconnecting}
              isStreaming={is_streaming}
              streamTimecode={timecode}
              onStart={start}
              onPause={pause}
              onResume={resume}
              onStop={stop}
              onReset={reset}
              onSkip={skipCurrentScene}
            />

            {/* Timeline */}
            <Card className="p-6">
              <h2 className="mb-4 text-lg font-semibold">Scene Timeline</h2>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={scenes.map((scene, i) => `${scene.sceneName}-${i}`)}
                  strategy={verticalListSortingStrategy}
                >
                  <OrchestratorTimeline
                    scenes={scenes}
                    currentSceneIndex={current_scene_index || 0}
                    progress={progress}
                    currentTime={current_time}
                    totalDuration={total_duration}
                    onSceneClick={forceScene}
                    onEditScene={handleEditScene}
                  />
                </SortableContext>
              </DndContext>
            </Card>
          </div>

          {/* Right Column - Scheduled Elements */}
          <div className="lg:col-span-1">
            <ScheduledElementsList
              elements={scheduled_elements}
              currentTime={current_time}
            />
          </div>
        </div>
      </div>

      {/* Edit Scene Dialog */}
      <EditSceneDialog
        open={editingScene !== null}
        onOpenChange={(open) => !open && setEditingScene(null)}
        scene={editingScene?.scene ?? null}
        onSave={handleSaveScene}
      />
    </div>
  )
}
