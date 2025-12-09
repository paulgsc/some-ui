import type { FC } from "react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Layers } from "lucide-react"
import {
  selectCompletedScene,
  selectCurrentScene,
  selectCurrentSceneIndex,
  selectCurrentTime,
  selectScheduledScenes,
  useOrchestratorStore,
} from "some-ui-utils"

type ScheduledElement = {
  id: string
  scene_name: string
  start_time: number
  end_time?: number
  duration: number
  is_active: boolean
  metadata?: {
    title?: string
    subtitle?: string
    description?: string
    [key: string]: any
  }
}

type ScheduledElementsListProps = {}

export const ScheduledElementsList: FC<ScheduledElementsListProps> = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const upcomingProbeRef = useRef<HTMLDivElement>(null)
  const [maxUpcoming, setMaxUpcoming] = useState(1)

  const currentTime = useOrchestratorStore(selectCurrentTime)

  const currentScene = useOrchestratorStore(selectCurrentScene)
  const scheduledScenes = useOrchestratorStore(selectScheduledScenes)
  const currentIndex = useOrchestratorStore(selectCurrentSceneIndex)
  const completedScene = useOrchestratorStore(selectCompletedScene)

  const upcomingScenes = useMemo(
    () => scheduledScenes.slice(currentIndex + 1).slice(0, maxUpcoming),
    [scheduledScenes, currentIndex, maxUpcoming]
  )

  // Measure available height and determine how many upcoming scenes fit
  useLayoutEffect(() => {
    if (!containerRef.current || !upcomingProbeRef.current) return
    if (scheduledScenes.length === 0) return

    const containerHeight = containerRef.current.clientHeight

    const fixedSectionsHeight = Array.from(
      containerRef.current.querySelectorAll("[data-fixed-section]")
    ).reduce((sum, el) => sum + (el as HTMLElement).offsetHeight, 0)

    const remaining = containerHeight - fixedSectionsHeight
    const cardHeight = upcomingProbeRef.current.offsetHeight

    if (cardHeight <= 0) return

    const fit = Math.max(1, Math.floor(remaining / (cardHeight + 8))) // +8 for gap
    setMaxUpcoming(fit)
  }, [currentScene, completedScene, scheduledScenes.length])

  return (
    <div className="flex h-full flex-col rounded-lg border bg-card">
      <div className="border-b p-4">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Scheduled Elements</h3>
          <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
            {scheduledScenes.length}
          </span>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-hidden">
        <div className="h-full p-4 space-y-3">
          {/* Active Element */}
          {currentScene && (
            <div data-fixed-section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Active Now
              </h4>
              <ElementCard
                key={currentScene.id}
                element={currentScene}
                currentTime={currentTime}
                status="active"
              />
            </div>
          )}

          {/* Completed Element */}
          {completedScene && (
            <div data-fixed-section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Completed
              </h4>
              <ElementCard
                key={completedScene.id}
                element={completedScene}
                currentTime={currentTime}
                status="past"
              />
            </div>
          )}

          {/* Upcoming Elements - only renders what fits */}
          {scheduledScenes.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Upcoming
              </h4>
              <div className="space-y-2">
                {upcomingScenes.map((element, index) => (
                  <ElementCard
                    key={element.id}
                    element={element}
                    currentTime={currentTime}
                    status="upcoming"
                    style={{
                      animationDelay: `${index * 50}ms`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {scheduledScenes.length === 0 && (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              No scheduled scenes
            </div>
          )}

          {/* Hidden probe card for height measurement */}
          {scheduledScenes.length > 0 && (
            <div className="absolute invisible pointer-events-none">
              <div ref={upcomingProbeRef}>
                <ElementCard
                  element={scheduledScenes[0]}
                  currentTime={currentTime}
                  status="upcoming"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

type ElementCardProps = {
  element: ScheduledElement
  currentTime: number
  status: "active" | "upcoming" | "past"
  style?: React.CSSProperties
}

const ElementCard = ({
  element,
  currentTime,
  status,
  style,
}: ElementCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false)

  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasMetadata = !!(
    element.metadata?.title ||
    element.metadata?.subtitle ||
    element.metadata?.description
  )

  // Only active cards with metadata are expandable
  const expandable = status === "active" && hasMetadata

  const progress =
    status === "active" && element.end_time
      ? ((currentTime - element.start_time) /
          (element.end_time - element.start_time)) *
        100
      : 0

  useEffect(() => {
    // Clear any pending timers
    if (expandTimerRef.current) {
      clearTimeout(expandTimerRef.current)
      expandTimerRef.current = null
    }

    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current)
      collapseTimerRef.current = null
    }

    if (expandable) {
      expandTimerRef.current = setTimeout(() => {
        setIsExpanded(true)
      }, 500)

      collapseTimerRef.current = setTimeout(() => {
        setIsExpanded(false)
      }, 4000)
    }

    return () => {
      if (expandTimerRef.current) {
        clearTimeout(expandTimerRef.current)
        expandTimerRef.current = null
      }
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current)
        collapseTimerRef.current = null
      }
    }
  }, [expandable])

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    return hours > 0
      ? `${hours}:${mins.toString().padStart(2, "0")}:${secs
          .toString()
          .padStart(2, "0")}`
      : `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const cardClasses = [
    "rounded-lg border p-3 transition-all duration-500",
    status === "active" &&
      "border-emerald-500/50 bg-gradient-to-br from-emerald-500/10 via-cyan-500/5 to-blue-500/10 shadow-lg shadow-emerald-500/10 animate-in fade-in slide-in-from-bottom-2",
    status === "upcoming" &&
      "border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-orange-500/5 hover:border-amber-500/50 hover:shadow-md hover:shadow-amber-500/10 animate-in fade-in slide-in-from-bottom-1",
    status === "past" &&
      "border-green-500/30 bg-gradient-to-br from-green-500/10 to-emerald-500/5 opacity-70",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div style={style} className={cardClasses}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {element.id}
            </span>
            {status === "active" && (
              <span className="rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-xs font-medium animate-pulse">
                Live
              </span>
            )}
            {status === "past" && (
              <span className="rounded-full bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/30 px-2 py-0.5 text-xs font-medium">
                Done
              </span>
            )}
          </div>
          <p className="text-sm font-medium">{element.scene_name}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatTime(element.start_time)}</span>
            <span>→</span>
            <span>{element.end_time ? formatTime(element.end_time) : "—"}</span>
            <span className="ml-auto">({formatTime(element.duration)})</span>
          </div>
        </div>

        {expandable && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Toggle metadata"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-300 ${
                isExpanded ? "rotate-180" : ""
              }`}
            />
          </button>
        )}
      </div>

      {status === "active" && element.end_time && (
        <div className="mt-2 h-1 bg-emerald-500/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-1000 ease-linear"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}

      {expandable && (
        <div
          className={`grid transition-all duration-500 ease-in-out ${
            isExpanded
              ? "grid-rows-[1fr] opacity-100 mt-3"
              : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <div className="pt-3 border-t border-emerald-500/20 space-y-2">
              {element.metadata?.title && (
                <div>
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">
                    Title
                  </p>
                  <p className="text-sm text-foreground">
                    {element.metadata.title}
                  </p>
                </div>
              )}

              {element.metadata?.subtitle && (
                <div>
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">
                    Subtitle
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {element.metadata.subtitle}
                  </p>
                </div>
              )}

              {element.metadata?.description && (
                <div>
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">
                    Description
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {element.metadata.description}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
