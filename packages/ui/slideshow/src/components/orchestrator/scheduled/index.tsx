import { Layers } from "lucide-react"

import { cn } from "some-ui-utils"
import { Badge } from "some-ui-shared"
import { Card } from "some-ui-shared"
import { ScrollArea } from "some-ui-shared"

interface ScheduledElement {
  id: string
  sceneName: string
  startTime: number
  endTime?: number
  duration: number
  isActive: boolean
}

interface ScheduledElementsListProps {
  elements: ScheduledElement[]
  currentTime: number
}

export function ScheduledElementsList({
  elements,
  currentTime,
}: ScheduledElementsListProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const activeElements = elements.filter((el) => el.isActive)
  const upcomingElements = elements.filter(
    (el) => !el.isActive && el.startTime > currentTime
  )
  const pastElements = elements.filter(
    (el) => !el.isActive && el.endTime && el.endTime <= currentTime
  )

  return (
    <Card className="flex h-full flex-col">
      <div className="border-b p-4">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Scheduled Elements</h3>
          <Badge variant="secondary" className="ml-auto">
            {elements.length}
          </Badge>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {/* Active Elements */}
          {activeElements.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Active Now
              </h4>
              {activeElements.map((element) => (
                <ElementCard
                  key={element.id}
                  element={element}
                  status="active"
                />
              ))}
            </div>
          )}

          {/* Upcoming Elements */}
          {upcomingElements.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Upcoming
              </h4>
              {upcomingElements.slice(0, 5).map((element) => (
                <ElementCard
                  key={element.id}
                  element={element}
                  status="upcoming"
                />
              ))}
            </div>
          )}

          {/* Past Elements */}
          {pastElements.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Completed
              </h4>
              {pastElements.slice(-3).map((element) => (
                <ElementCard key={element.id} element={element} status="past" />
              ))}
            </div>
          )}

          {elements.length === 0 && (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              No scheduled elements
            </div>
          )}
        </div>
      </ScrollArea>
    </Card>
  )
}

interface ElementCardProps {
  element: ScheduledElement
  status: "active" | "upcoming" | "past"
}

function ElementCard({ element, status }: ElementCardProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        status === "active" && "border-primary bg-primary/5",
        status === "upcoming" && "border-border bg-card",
        status === "past" && "border-muted bg-muted/30 opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {element.id}
            </span>
            {status === "active" && (
              <Badge
                variant="default"
                className="h-5 bg-primary/20 text-primary"
              >
                Active
              </Badge>
            )}
          </div>
          <p className="text-sm font-medium">{element.sceneName}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatTime(element.startTime)}</span>
            <span>→</span>
            <span>{element.endTime ? formatTime(element.endTime) : "—"}</span>
            <span className="ml-auto">({formatTime(element.duration)})</span>
          </div>
        </div>
      </div>
    </div>
  )
}
