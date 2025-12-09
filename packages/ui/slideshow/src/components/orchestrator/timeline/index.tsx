import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Clock, Edit2 } from "lucide-react"
import type { SceneConfig } from "some-types-utils"
import { Card } from "some-ui-shared"
import {
  cn,
  selectCurrentSceneIndex,
  selectCurrentTime,
  selectProgress,
  selectTotalDuration,
  useOrchestratorStore,
} from "some-ui-utils"

type OrchestratorTimelineProps = {
  scenes: Array<SceneConfig>
  onEditScene: (index: number) => void
}

export const OrchestratorTimeline = ({
  scenes,
  onEditScene,
}: OrchestratorTimelineProps) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const currentSceneIndex = useOrchestratorStore(selectCurrentSceneIndex)
  const currentTime = useOrchestratorStore(selectCurrentTime)
  const progress = useOrchestratorStore(selectProgress)
  const totalDuration = useOrchestratorStore(selectTotalDuration)
  const forceScene = useOrchestratorStore((s) => s.forceScene)

  let cumulativeTime = 0

  return (
    <div className="space-y-4">
      {/* Timeline Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </span>
        </div>
        <div className="text-sm text-muted-foreground">
          {scenes.length} {scenes.length === 1 ? "scene" : "scenes"}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Scene Timeline */}
      <div className="space-y-2">
        {scenes.map((scene, index) => {
          const sceneStart = cumulativeTime
          const sceneEnd = cumulativeTime + scene.duration
          const isActive = index === currentSceneIndex
          const isPast = index < currentSceneIndex
          const isFuture = index > currentSceneIndex

          cumulativeTime += scene.duration

          return (
            <TimelineScene
              key={`${scene.scene_name}-${index}`}
              scene={scene}
              index={index}
              isActive={isActive}
              isPast={isPast}
              isFuture={isFuture}
              sceneStart={sceneStart}
              sceneEnd={sceneEnd}
              onSceneClick={forceScene}
              onEditScene={onEditScene}
            />
          )
        })}
      </div>
    </div>
  )
}

type TimelineSceneProps = {
  scene: SceneConfig
  index: number
  isActive: boolean
  isPast: boolean
  isFuture: boolean
  sceneStart: number
  sceneEnd: number
  onSceneClick: (scene_name: string) => void
  onEditScene: (index: number) => void
}

const TimelineScene = ({
  scene,
  index,
  isActive,
  isPast,
  isFuture,
  sceneStart,
  sceneEnd,
  onSceneClick,
  onEditScene,
}: TimelineSceneProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `${scene.scene_name}-${index}`,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card
        className={cn(
          "group relative cursor-pointer overflow-hidden border-2 transition-all hover:shadow-md",
          isActive && "border-primary bg-primary/5 shadow-lg",
          isPast && "border-muted bg-muted/30 opacity-60",
          isFuture && "border-border bg-card",
          isDragging && "opacity-50"
        )}
        onClick={() => onSceneClick(scene.scene_name)}
      >
        <div className="flex items-center gap-4 p-4">
          {/* Drag Handle */}
          <div
            {...listeners}
            className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="4" cy="4" r="1.5" fill="currentColor" />
              <circle cx="4" cy="8" r="1.5" fill="currentColor" />
              <circle cx="4" cy="12" r="1.5" fill="currentColor" />
              <circle cx="12" cy="4" r="1.5" fill="currentColor" />
              <circle cx="12" cy="8" r="1.5" fill="currentColor" />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" />
            </svg>
          </div>

          {/* Scene Info */}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">
                #{index + 1}
              </span>
              <h3 className={cn("font-semibold", isActive && "text-primary")}>
                {scene.scene_name}
              </h3>
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span>{formatTime(scene.duration)}</span>
              <span>•</span>
              <span>
                {formatTime(sceneStart)} → {formatTime(sceneEnd)}
              </span>
            </div>
          </div>

          {/* Edit Button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onEditScene(index)
            }}
            className="rounded-md p-2 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-accent-foreground group-hover:opacity-100"
          >
            <Edit2 className="h-4 w-4" />
          </button>

          {/* Active Indicator */}
          {isActive && (
            <div className="absolute left-0 top-0 h-full w-1 bg-primary">
              <div className="absolute left-0 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-primary" />
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
