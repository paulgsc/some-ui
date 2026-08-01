import type { FC, JSX } from "react"
import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { Badge, Card, ScrollArea } from "@some-ui/shared"
import type { ActiveLifetime } from "@some-ui/types"
import { Activity, ChevronDown, Clock, Layers, LayoutGrid } from "lucide-react"
import {
  cn,
  selectCurrentTime,
  useOrchestratorStore,
  useSceneLifetimes,
} from "some-ui-utils"

export const ActiveLifetimesPanel: FC = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [maxVisible, setMaxVisible] = useState(3)

  const activeLifetimes = useSceneLifetimes()
  const currentTime = useOrchestratorStore(selectCurrentTime)

  // Memoize grouping to avoid layout thrashing
  const concurrentGroups = useMemo(() => {
    return activeLifetimes.length > 1
  }, [activeLifetimes.length])

  // Ergonomic Height Calculation: Ensures the panel doesn't overflow its parent container
  useLayoutEffect((): (() => void) | void => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries): void => {
      for (let entry of entries) {
        const availableHeight = entry.contentRect.height
        // Estimate: Card (approx 100px) + Gap (12px). Minimum 2 cards.
        const fit = Math.max(2, Math.floor(availableHeight / 112))
        setMaxVisible(fit)
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const visibleLifetimes = activeLifetimes.slice(0, maxVisible)
  const hiddenCount = Math.max(0, activeLifetimes.length - maxVisible)

  return (
    <div className="flex h-full flex-col rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* Header Section */}
      <div
        className="flex items-center justify-between border-b bg-muted/30 px-4 py-3"
        data-fixed-section
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <Activity className="h-4 w-4 text-emerald-500" />
            <span className="absolute -right-1 -top-1 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          </div>
          <h3 className="text-sm font-bold tracking-tight">Live Status</h3>
        </div>
        <div className="flex items-center gap-2">
          {concurrentGroups && (
            <Badge
              variant="outline"
              className="border-purple-500/30 text-purple-600 bg-purple-500/5 gap-1 px-1.5"
            >
              <Layers size={10} />
              <span className="text-[10px]">Stacked</span>
            </Badge>
          )}
          <Badge variant="secondary" className="font-mono">
            {activeLifetimes.length}
          </Badge>
        </div>
      </div>

      {/* Content Area */}
      <div ref={containerRef} className="flex-1 min-h-0 relative">
        <ScrollArea className="h-full p-4">
          <div className="space-y-3">
            {activeLifetimes.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center gap-2 text-muted-foreground opacity-50">
                <Clock size={24} strokeWidth={1} />
                <span className="text-xs font-medium">No active lifetimes</span>
              </div>
            ) : (
              <>
                {visibleLifetimes.map((lifetime) => (
                  <LifetimeCard
                    key={lifetime.id}
                    lifetime={lifetime}
                    currentTime={currentTime}
                    isConcurrent={activeLifetimes.length > 1}
                  />
                ))}

                {hiddenCount > 0 && (
                  <div className="flex items-center justify-center py-2">
                    <div className="h-px flex-1 bg-border" />
                    <span className="px-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      +{hiddenCount} More Active
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

const LifetimeCard = ({
  lifetime,
  currentTime,
  isConcurrent,
}: {
  lifetime: ActiveLifetime
  currentTime: number
  isConcurrent: boolean
}): JSX.Element => {
  const [isExpanded, setIsExpanded] = useState(false)

  // Logic updated for new Discriminated Union
  const {
    kind: {
      Scene: { ui, duration, scene_name },
    },
  } = lifetime
  const sceneName = scene_name
  const uiIntents = ui

  const elapsedMs = currentTime - lifetime.started_at
  const progress = Math.min(100, (elapsedMs / duration) * 100)

  const formatTime = (ms: number): string => {
    const s = Math.floor(Math.abs(ms) / 1000)
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`
  }

  return (
    <Card
      className={cn(
        "group relative overflow-hidden transition-all duration-300 border-l-2",
        isConcurrent
          ? "border-l-purple-500 shadow-purple-500/5"
          : "border-l-emerald-500 shadow-emerald-500/5",
        "hover:bg-accent/50"
      )}
    >
      <div className="p-3">
        <div className="flex items-start justify-between mb-2">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-muted-foreground">
                ID_{lifetime.id}
              </span>
              <h4 className="text-sm font-bold leading-none">{sceneName}</h4>
            </div>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock size={10} /> {formatTime(elapsedMs)} elapsed
            </p>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="rounded-full p-1 hover:bg-muted transition-colors"
          >
            <ChevronDown
              size={14}
              className={cn("transition-transform", isExpanded && "rotate-180")}
            />
          </button>
        </div>

        {/* Dynamic Progress Bar */}
        <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-1000 ease-linear",
              isConcurrent ? "bg-purple-500" : "bg-emerald-500"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Ergonomic UI Intent Summary */}
        {isExpanded && (
          <div className="mt-3 space-y-2 border-t pt-2 animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              <LayoutGrid size={12} /> UI Composition
            </div>
            {uiIntents?.map((ui, i) => (
              <div
                key={ui.panels ? Object.keys(ui.panels).join("-") : i}
                className="bg-muted/50 rounded p-2"
              >
                {ui.panels &&
                  Object.entries(ui.panels).map(([key, placement]) => (
                    <>
                      <div
                        key={key}
                        className="flex justify-between items-center text-[11px] mb-1 last:mb-0"
                      >
                        <span className="font-mono text-muted-foreground">
                          {key}:
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[9px] h-4 py-0"
                        >
                          {placement.registry_key}
                        </Badge>
                      </div>
                      {placement.focus && (
                        <div className="mt-1 pt-1 border-t border-dashed flex justify-between text-[9px]">
                          <span className="text-muted-foreground italic">
                            Focus: {placement.focus.region}
                          </span>
                          <span className="text-primary">
                            {(placement.focus.intensity * 100).toFixed(0)}%
                          </span>
                        </div>
                      )}
                    </>
                  ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}
