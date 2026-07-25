import type { FC, JSX } from "react"
import { useMemo } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { SceneConfig } from "@some-ui/types"
import { AlertCircle, Edit2, Layers, Layout, Trash2 } from "lucide-react"
import {
  Badge,
  Card,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "some-ui-shared"
import {
  cn,
  selectCurrentTime,
  selectTotalDuration,
  useOrchestratorStore,
  useSceneLifetimes,
} from "some-ui-utils"

type OrchestratorTimelineProps = {
  scenes: Array<SceneConfig>
  onEditScene: (index: number) => void
  onDeleteScene?: (index: number) => void
}

export const OrchestratorTimeline = ({
  scenes,
  onEditScene,
  onDeleteScene,
}: OrchestratorTimelineProps): JSX.Element => {
  const currentTime = useOrchestratorStore(selectCurrentTime)
  const totalDuration = useOrchestratorStore(selectTotalDuration)
  const activeLifetimes = useSceneLifetimes()
  const forceScene = useOrchestratorStore((s) => s.forceScene)

  const formatTime = (ms: number): string => {
    const secs = Math.floor(ms / 1000)
    const mins = Math.floor(secs / 60)
    const remainingSecs = secs % 60
    return `${mins}:${remainingSecs.toString().padStart(2, "0")}`
  }

  // Calculate Layout Positions
  const sceneLayouts = useMemo(() => {
    return scenes.map((scene) => {
      const endTime = scene.start_time + scene.duration
      // Check for overlaps with ANY other scene to flag concurrency
      const isConcurrent = scenes.some(
        (other) =>
          other !== scene &&
          scene.start_time < other.start_time + other.duration &&
          endTime > other.start_time
      )

      // Safely get UI components
      const uiArray = Array.isArray(scene.ui) ? scene.ui : []
      const uiComponents = Array.from(
        new Set(
          uiArray.flatMap((u) =>
            Object.values(u.panels ?? {}).map((c) => c.registry_key)
          )
        )
      )

      return {
        scene,
        endTime,
        isConcurrent,
        uiComponents,
      }
    })
  }, [scenes])

  const maxTimelineEnd = Math.max(
    totalDuration,
    ...sceneLayouts.map((s) => s.endTime)
  )

  const activeSceneIds = new Set(
    activeLifetimes.map((lt) => lt.kind.Scene.scene_id)
  )

  return (
    <div className="flex flex-col gap-6 p-1">
      {/* 1. Global Track Minimap */}
      <div className="bg-muted/30 p-3 rounded-xl border border-dashed border-border">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
            Global Timeline
          </span>
          <Badge variant="outline" className="font-mono text-[10px]">
            {formatTime(currentTime)}
          </Badge>
        </div>
        <div className="relative h-8 w-full bg-background/50 rounded-md overflow-hidden border">
          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-px bg-primary z-10 shadow-[0_0_8px_rgba(var(--primary),0.8)]"
            style={{ left: `${(currentTime / maxTimelineEnd) * 100}%` }}
          />
          {sceneLayouts.map((s) => (
            <div
              key={s.scene.scene_name}
              className={cn(
                "absolute h-3 top-2.5 rounded-sm transition-colors",
                activeSceneIds.has(s.scene.scene_name)
                  ? "bg-emerald-500"
                  : "bg-primary/20"
              )}
              style={{
                left: `${(s.scene.start_time / maxTimelineEnd) * 100}%`,
                width: `${(s.scene.duration / maxTimelineEnd) * 100}%`,
              }}
            />
          ))}
        </div>
      </div>

      {/* 2. Detailed List */}
      <div className="grid gap-3">
        {sceneLayouts.map((layout, index) => {
          const isActive = activeSceneIds.has(layout.scene.scene_name)
          return (
            <GanttTimelineScene
              key={`scene-${layout.scene.scene_name}`}
              scene={layout.scene}
              index={index}
              isActive={isActive}
              isPast={layout.endTime < currentTime}
              maxTimelineEnd={maxTimelineEnd}
              isConcurrent={layout.isConcurrent}
              uiComponents={layout.uiComponents}
              onSceneClick={forceScene}
              onEditScene={onEditScene}
              onDeleteScene={onDeleteScene}
            />
          )
        })}
      </div>
    </div>
  )
}

type GanttTimelineSceneProps = {
  scene: SceneConfig
  index: number
  isActive: boolean
  isPast: boolean
  maxTimelineEnd: number
  isConcurrent: boolean
  uiComponents: Array<string>
  onSceneClick: (sceneId: string) => void
  onEditScene: (index: number) => void
  onDeleteScene?: (index: number) => void
}

const GanttTimelineScene: FC<GanttTimelineSceneProps> = ({
  scene,
  index,
  isActive,
  isPast,
  maxTimelineEnd,
  isConcurrent,
  uiComponents,
  onSceneClick,
  onEditScene,
  onDeleteScene,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `scene-${index}`,
  })

  const startPercent = (scene.start_time / maxTimelineEnd) * 100
  const widthPercent = (scene.duration / maxTimelineEnd) * 100
  const uiIntentCount = Array.isArray(scene.ui) ? scene.ui.length : 0

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      className="group"
    >
      <Card
        className={cn(
          "relative border-l-4 transition-all duration-200 hover:shadow-md",
          isActive
            ? "border-l-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500/20"
            : "border-l-transparent",
          isPast && "opacity-60 grayscale-[0.5]",
          isDragging && "z-50 shadow-2xl"
        )}
        onClick={() => onSceneClick(scene.scene_name)}
      >
        <div className="p-3 flex items-center gap-4">
          {/* Reorder Handle */}
          <div
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground/40 hover:text-foreground"
          >
            <Layers size={16} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                {(scene.start_time / 1000).toFixed(1)}s
              </span>
              <h4 className="font-bold truncate text-sm">{scene.scene_name}</h4>
              {isConcurrent && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertCircle size={14} className="text-amber-500" />
                    </TooltipTrigger>
                    <TooltipContent>Overlaps with another scene</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            {/* Spark-Timeline: Visualizing placement within the specific row */}
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden relative mb-2">
              <div
                className={cn(
                  "absolute h-full rounded-full",
                  isActive ? "bg-emerald-500" : "bg-primary/40"
                )}
                style={{ left: `${startPercent}%`, width: `${widthPercent}%` }}
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex -space-x-1">
                {uiComponents.slice(0, 5).map((comp: string) => (
                  <div
                    key={comp}
                    className="h-5 w-5 rounded-full border border-background bg-secondary flex items-center justify-center"
                    title={comp}
                  >
                    <Layout size={10} className="text-secondary-foreground" />
                  </div>
                ))}
                {uiComponents.length > 5 && (
                  <div className="h-5 w-5 rounded-full border border-background bg-muted flex items-center justify-center text-[8px] font-bold text-muted-foreground">
                    +{uiComponents.length - 5}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">
                {scene.duration}ms • {uiIntentCount} UI LAYER
                {uiIntentCount !== 1 ? "S" : ""}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onEditScene(index)
              }}
              className="p-2 hover:bg-accent rounded-md"
              title="Edit scene"
            >
              <Edit2 size={14} />
            </button>
            {onDeleteScene && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(`Delete scene "${scene.scene_name}"?`)) {
                    onDeleteScene(index)
                  }
                }}
                className="p-2 hover:bg-destructive/10 text-destructive rounded-md"
                title="Delete scene"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
