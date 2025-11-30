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
  EditSceneDialog,
  OrchestratorControls,
  OrchestratorTimeline,
  ScheduledElementsList,
} from "@slideshow/components"
import { Plus } from "lucide-react"
import type { SceneConfig } from "some-types-utils"
import { Button, Card } from "some-ui-shared"
import { useOrchestrator } from "some-ui-utils"

// Mock demo data
const DEMO_SCENES: Array<SceneConfig> = [
  { scene_name: "Opening Sequence", duration: 30 },
  { scene_name: "Main Content Block", duration: 120 },
  { scene_name: "Transition Graphics", duration: 15 },
  { scene_name: "Interview Segment", duration: 180 },
  { scene_name: "Product Showcase", duration: 90 },
  { scene_name: "Closing Credits", duration: 45 },
]

export const OrchestratorDemo = () => {
  const [scenes, setScenes] = useState<Array<SceneConfig>>(DEMO_SCENES)
  const [editingScene, setEditingScene] = useState<{
    scene: SceneConfig
    index: number
  } | null>(null)

  const orchestrator = useOrchestrator({
    streamId: "test",
    scenes,
    autoStart: false,
    onSceneChange: (from, to) => {
      console.log("[v0] Scene changed:", from, "→", to)
    },
    onError: (error) => {
      console.error("[v0] Orchestrator error:", error)
    },
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      setScenes((items) => {
        const oldIndex = items.findIndex(
          (item, i) => `${item.sceneName}-${i}` === active.id
        )
        const newIndex = items.findIndex(
          (item, i) => `${item.sceneName}-${i}` === over.id
        )

        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  const handleEditScene = (index: number) => {
    setEditingScene({ scene: scenes[index], index })
  }

  const handleSaveScene = (updatedScene: SceneConfig) => {
    if (editingScene === null) return

    const newScenes = [...scenes]
    newScenes[editingScene.index] = updatedScene
    setScenes(newScenes)
    setEditingScene(null)
  }

  const handleAddScene = () => {
    const newScene: SceneConfig = {
      sceneName: `New Scene ${scenes.length + 1}`,
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
              isRunning={orchestrator.isRunning}
              isConnected={orchestrator.isConnected}
              isReconnecting={orchestrator.isReconnecting}
              isStreaming={orchestrator.streamStatus.isStreaming}
              streamTimecode={orchestrator.streamStatus.timecode}
              onStart={orchestrator.start}
              onPause={orchestrator.pause}
              onResume={orchestrator.resume}
              onStop={orchestrator.stop}
              onReset={orchestrator.reset}
              onSkip={orchestrator.skipCurrentScene}
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
                    currentSceneIndex={
                      orchestrator.state.currentSceneIndex || 0
                    }
                    progress={orchestrator.progress}
                    currentTime={orchestrator.currentTime}
                    totalDuration={orchestrator.totalDuration}
                    onSceneClick={orchestrator.forceScene}
                    onEditScene={handleEditScene}
                  />
                </SortableContext>
              </DndContext>
            </Card>
          </div>

          {/* Right Column - Scheduled Elements */}
          <div className="lg:col-span-1">
            <ScheduledElementsList
              elements={orchestrator.scheduledElements}
              currentTime={orchestrator.currentTime}
            />
          </div>
        </div>
      </div>

      {/* Edit Scene Dialog */}
      <EditSceneDialog
        open={editingScene !== null}
        onOpenChange={(open) => !open && setEditingScene(null)}
        scene={editingScene?.scene || null}
        onSave={handleSaveScene}
      />
    </div>
  )
}
