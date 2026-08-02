import type { JSX } from "react"
import { useReducer } from "react"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { resequence } from "@some-ui/activity-catalog"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Switch,
} from "@some-ui/shared"
import {
  editorReducer,
  EditSceneDialog,
  OrchestratorTimeline,
} from "@some-ui/slideshow"
import type { EditorState } from "@some-ui/slideshow"
import type { SceneConfig } from "@some-ui/types"

import { formatTimecode } from "@/lib/format"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationControls } from "@/components/pagination-controls"

const CLOSED_EDITOR_STATE: EditorState = { type: "Closed" }
/** Basic mode's read-only preview list is compact rows, same page size as the other simple lists. */
const BASIC_SCENE_PAGE_SIZE = 10

type ArrangementStepProps = {
  basicScenes: Array<SceneConfig>
  mode: "basic" | "advanced"
  advancedScenes: Array<SceneConfig> | null
  onEnableAdvanced: () => void
  onDisableAdvanced: () => void
  onScenesChange: (scenes: Array<SceneConfig>) => void
}

export const ArrangementStep = ({
  basicScenes,
  mode,
  advancedScenes,
  onEnableAdvanced,
  onDisableAdvanced,
  onScenesChange,
}: ArrangementStepProps): JSX.Element => {
  const [editorState, dispatchEditor] = useReducer(
    editorReducer,
    CLOSED_EDITOR_STATE
  )
  const scenes =
    mode === "advanced" ? (advancedScenes ?? basicScenes) : basicScenes

  // Numbered against the full list before paginating, so a scene's position
  // badge stays correct regardless of which page it's on. Called
  // unconditionally (basicScenes is always available) even though its
  // result is only rendered in "basic" mode - Rules of Hooks.
  const numberedBasicScenes = basicScenes.map((scene, index) => ({
    scene,
    position: index + 1,
  }))
  const {
    pageItems: basicScenePage,
    currentPage: basicPageNumber,
    totalPages: basicTotalPages,
    goToPreviousPage: goToPreviousBasicPage,
    goToNextPage: goToNextBasicPage,
  } = usePagination(numberedBasicScenes, BASIC_SCENE_PAGE_SIZE)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = scenes.findIndex((_, i) => `scene-${i}` === active.id)
    const newIndex = scenes.findIndex((_, i) => `scene-${i}` === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onScenesChange(resequence(arrayMove(scenes, oldIndex, newIndex)))
  }

  const handleEditScene = (index: number): void => {
    const scene = scenes[index]
    dispatchEditor({ type: "OPEN_FOR_EDIT", sceneIndex: index, scene })
  }

  const handleSaveEdit = (
    sceneIndex: number,
    updatedScene: SceneConfig
  ): void => {
    const updated = [...scenes]
    updated[sceneIndex] = updatedScene
    onScenesChange(resequence(updated))
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-center justify-between gap-4 pt-6">
          <div>
            <p className="font-medium">Advanced arrangement</p>
            <p className="text-muted-foreground text-sm">
              {mode === "advanced"
                ? "You are editing the real scene timeline the orchestrator plays from."
                : "Activities play back-to-back in the order you chose. Turn this on to fine-tune timing or explore layout."}
            </p>
          </div>
          <Switch
            checked={mode === "advanced"}
            onCheckedChange={(checked) =>
              checked ? onEnableAdvanced() : onDisableAdvanced()
            }
          />
        </CardContent>
      </Card>

      {mode === "basic" ? (
        <div className="space-y-2">
          {basicScenePage.map(({ scene, position }) => (
            <Card key={scene.scene_name}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <span className="bg-muted flex size-6 items-center justify-center rounded-full text-xs font-medium">
                    {position}
                  </span>
                  <p className="font-medium">{scene.scene_name}</p>
                </div>
                <p className="text-muted-foreground text-sm">
                  starts at {formatTimecode(scene.start_time)} •{" "}
                  {Math.round(scene.duration / 60_000)} min
                </p>
              </CardContent>
            </Card>
          ))}
          <PaginationControls
            currentPage={basicPageNumber}
            totalPages={basicTotalPages}
            onPrevious={goToPreviousBasicPage}
            onNext={goToNextBasicPage}
          />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Scene timeline</CardTitle>
              <p className="text-muted-foreground text-sm">
                This is the same timeline the orchestrator uses to drive
                playback. A &quot;scene&quot; is one activity running for a
                stretch of time. Drag to reorder, or click a scene to rename it
                or change its length.
              </p>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <p className="font-medium">Editing the layout</p>
              <p className="text-muted-foreground text-sm">
                Layout isn&apos;t arranged here. Press{" "}
                <kbd className="bg-muted rounded border px-1.5 py-0.5 font-mono text-xs">
                  E
                </kbd>{" "}
                while this session is playing to edit its layout live, in place,
                on the real player.
              </p>
            </CardContent>
          </Card>

          <EditSceneDialog
            state={editorState}
            dispatch={dispatchEditor}
            onSaveEdit={handleSaveEdit}
          />
        </>
      )}
    </div>
  )
}
