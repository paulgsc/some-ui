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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageControls,
  Switch,
} from "@some-ui/shared"
import {
  editorReducer,
  EditSceneDialog,
  OrchestratorTimeline,
} from "@some-ui/slideshow"
import type { EditorState } from "@some-ui/slideshow"
import type { SceneConfig } from "@some-ui/types"
import { useFittedPage } from "some-ui-utils"

import { formatTimecode } from "@/lib/format"

const CLOSED_EDITOR_STATE: EditorState = { type: "Closed" }

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
  // Memoized: `useFittedPage` treats a new `items` reference as a genuine
  // content change and lets the next growth attempt re-try a page size it had
  // already rejected, so an array rebuilt on every render never settles.
  const numberedBasicScenes = useMemo(
    () => basicScenes.map((scene, index) => ({ scene, position: index + 1 })),
    [basicScenes]
  )
  const {
    viewportRef: basicViewportRef,
    contentRef: basicContentRef,
    pageItems: basicScenePage,
    page: basicPageNumber,
    pageCount: basicPageCount,
    previous: goToPreviousBasicPage,
    next: goToNextBasicPage,
  } = useFittedPage(numberedBasicScenes, { minPerPage: 1, maxPerPage: 20 })

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
        <CardContent className="flex items-center justify-between gap-4 pt-6">
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
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div
            ref={basicViewportRef}
            data-scroll-intent="fitted-residue"
            className={
              // scroll-intent: fitted-residue — `useFittedPage` guarantees this
              // box's content fits it, with exactly one documented exception:
              // at `minPerPage` a single item taller than the whole box has to
              // overflow somewhere (see the hook's own Options doc). This says
              // where. It is not a greedy scroll - in every case the fit can
              // actually solve, the scrollbar never appears because the content
              // genuinely fits - it is the named home for the residue the fit
              // is honest about not being able to remove. Clipping it instead
              // is worse than it sounds: a card whose centre falls outside the
              // box stops being clickable at all.
              "min-h-0 flex-1 overflow-y-auto"
            }
          >
            <div ref={basicContentRef} className="space-y-2">
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
            </div>
          </div>
          <PageControls
            page={basicPageNumber}
            pageCount={basicPageCount}
            onPrevious={goToPreviousBasicPage}
            onNext={goToNextBasicPage}
            label="scenes"
          />
        </div>
      ) : (
        <div
          data-scroll-intent="editor"
          className={
            // scroll-intent: editor — the advanced timeline is a drag-and-drop
            // surface, not a list. Paging it would move a scene out from under
            // the pointer mid-drag, and the two supporting cards below it are
            // prose that belongs with it rather than after it. This is
            // docs/ui-fit's case 5: the one place in the wizard where scrolling
            // is the answer, declared here rather than inherited from a page
            // that happened to be taller than the window.
            "min-h-0 flex-1 space-y-4 overflow-y-auto"
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
        </div>
      )}
    </div>
  )
}
