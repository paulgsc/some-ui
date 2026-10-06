import type { JSX } from "react"
import { useMemo, useReducer } from "react"
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
import { useFittedPage } from "@some-ui/react-hooks"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageControls,
  Switch,
} from "@some-ui/shared"
import type { SceneConfig } from "@some-ui/types"

import { formatTimecode } from "@/lib/format"
import { EditSceneDialog } from "@/components/composer/scene-editor/edit-scene-dialog"
import type { EditorState } from "@/components/composer/scene-editor/scene-editor"
import { editorReducer } from "@/components/composer/scene-editor/scene-editor"
import { OrchestratorTimeline } from "@/components/composer/scene-editor/timeline"

const CLOSED_EDITOR_STATE: EditorState = { type: "Closed" }

type NumberedScene = { scene: SceneConfig; position: number }

type BasicSceneListProps = {
  scenes: ReadonlyArray<NumberedScene>
}

/**
 * The basic-mode read-only scene list, as its own component so the
 * `useFittedPage` instance mounts and unmounts with its node: toggling
 * Advanced replaces the div, and a hook living in `ArrangementStep` would keep
 * measuring the detached first node (`clientHeight: 0`) forever.
 */
const BasicSceneList = ({ scenes }: BasicSceneListProps): JSX.Element => {
  const {
    viewportRef,
    contentRef,
    pageItems,
    page,
    pageCount,
    previous,
    next,
  } = useFittedPage(scenes, { minPerPage: 1, maxPerPage: 20 })

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div
        ref={viewportRef}
        data-scroll-intent="fitted-residue"
        className={
          // scroll-intent: fitted-residue — see activity-picker-step.tsx's
          // catalogue box: the one item taller than the box at `minPerPage`
          // scrolls here rather than being clipped unclickable.
          "min-h-0 flex-1 overflow-y-auto handheld:no-scrollbar"
        }
      >
        <div ref={contentRef} className="space-y-2">
          {pageItems.map(({ scene, position }) => (
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
        </div>
      </div>
      <PageControls
        page={page}
        pageCount={pageCount}
        onPrevious={previous}
        onNext={next}
        label="scenes"
      />
    </div>
  )
}

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

  // Numbered against the full list before paginating, so a scene's badge is
  // right on every page. Memoized: a new array reads to `useFittedPage` as new
  // content and re-triggers a growth attempt it had settled.
  const numberedBasicScenes = useMemo(
    () => basicScenes.map((scene, index) => ({ scene, position: index + 1 })),
    [basicScenes]
  )

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
    <div className="flex h-full min-h-0 flex-col gap-4">
      <Card className="shrink-0">
        <CardContent className="flex items-center justify-between gap-4 pt-[var(--card-p,1.5rem)]">
          <div className="min-w-0">
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
        <BasicSceneList scenes={numberedBasicScenes} />
      ) : (
        <div
          data-scroll-intent="editor"
          className={
            // scroll-intent: editor — the advanced timeline is a drag-and-drop
            // surface; paging would move a scene out from under the pointer
            // mid-drag (docs/ui-fit's case 5).
            "min-h-0 flex-1 space-y-4 overflow-y-auto handheld:no-scrollbar"
          }
        >
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
            <CardContent className="pt-[var(--card-p,1.5rem)]">
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
        </div>
      )}
    </div>
  )
}
