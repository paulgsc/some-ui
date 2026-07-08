import type { JSX } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { assertNever } from "@input/utils"
import { Monitor, Play, Volume2, VolumeX, ZoomIn, ZoomOut } from "lucide-react"
import { Badge, Button } from "some-ui-shared"

type TimelineProps = {
  currentTime: number
  onTimeChange: (time: number) => void
}

type TimelineEvent = {
  id: string
  time: number
  duration: number
  action: "scene" | "play" | "unmute" | "mute"
  target: string
  label?: string
  color: string
}

const TOTAL_DURATION = 150 // 2.5 minutes
const BASE_PIXELS_PER_SECOND = 4

export const Timeline = ({
  currentTime,
  onTimeChange,
}: TimelineProps): JSX.Element => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [zoom, setZoom] = useState(1)

  const events = useMemo<Array<TimelineEvent>>(
    () => [
      {
        id: "1",
        time: 0,
        duration: 2,
        action: "scene",
        target: "Intro Scene",
        color: "#6366f1",
        label: "Opening",
      },
      {
        id: "2",
        time: 5,
        duration: 120,
        action: "play",
        target: "Theme Music",
        color: "#22c55e",
      },
      {
        id: "3",
        time: 10,
        duration: 110,
        action: "scene",
        target: "Main Camera",
        color: "#6366f1",
        label: "Main Content",
      },
      {
        id: "4",
        time: 60,
        duration: 0,
        action: "unmute",
        target: "Microphone",
        color: "#f59e0b",
        label: "Start Talking",
      },
    ],
    []
  )

  const pixelsPerSecond = BASE_PIXELS_PER_SECOND * zoom
  const timelineWidth = TOTAL_DURATION * pixelsPerSecond

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Handle High DPI displays
    const dpr = window.devicePixelRatio || 1
    const displayWidth = Math.max(800, timelineWidth + 100)
    const displayHeight = 80

    canvas.width = displayWidth * dpr
    canvas.height = displayHeight * dpr
    ctx.scale(dpr, dpr)

    // Clear canvas
    ctx.clearRect(0, 0, displayWidth, displayHeight)

    // Draw time ruler
    ctx.fillStyle = "#6b7280"
    ctx.font = "10px monospace"

    for (let i = 0; i <= TOTAL_DURATION; i += 10) {
      const x = i * pixelsPerSecond
      ctx.fillRect(x, 0, 1, 20)
      ctx.fillText(
        `${Math.floor(i / 60)}:${(i % 60).toString().padStart(2, "0")}`,
        x + 4,
        15
      )
    }

    // Draw events
    events.forEach((event) => {
      const x = event.time * pixelsPerSecond
      const width = Math.max(event.duration * pixelsPerSecond, 4)
      const y = 30
      const height = 40

      ctx.fillStyle = `${event.color}40`
      ctx.fillRect(x, y, width, height)

      ctx.strokeStyle = event.color
      ctx.lineWidth = 2
      ctx.strokeRect(x, y, width, height)

      ctx.fillStyle = "#ffffff"
      ctx.font = "bold 11px sans-serif"
      ctx.fillText(event.target, x + 4, y + 15)

      if (event.label) {
        ctx.fillStyle = "#d1d5db"
        ctx.font = "9px sans-serif"
        ctx.fillText(event.label, x + 4, y + 28)
      }
    })

    // Draw playhead
    const playheadX = currentTime * pixelsPerSecond
    ctx.strokeStyle = "#ef4444"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(playheadX, 0)
    ctx.lineTo(playheadX, displayHeight)
    ctx.stroke()

    ctx.fillStyle = "#ef4444"
    ctx.fillRect(playheadX - 4, 0, 8, 12)
  }, [currentTime, zoom, events, pixelsPerSecond, timelineWidth])

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const time = x / pixelsPerSecond
    onTimeChange(Math.max(0, Math.min(time, TOTAL_DURATION)))
  }

  const renderActionIcon = (
    action: TimelineEvent["action"]
  ): JSX.Element | null => {
    const iconClass = "size-3"
    switch (action) {
      case "scene": {
        return <Monitor className={iconClass} />
      }
      case "play": {
        return <Play className={iconClass} />
      }
      case "unmute": {
        return <Volume2 className={iconClass} />
      }
      case "mute": {
        return <VolumeX className={iconClass} />
      }
      default: {
        action satisfies never
        assertNever(action)
      }
    }
  }

  return (
    <div className="bg-card flex h-full flex-col text-card-foreground">
      <div className="border-border flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Timeline</h3>
          <Badge variant="outline" className="font-mono text-xs">
            {Math.floor(currentTime / 60)}:
            {(Math.floor(currentTime) % 60).toString().padStart(2, "0")} / 2:30
          </Badge>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={(): void => setZoom((prev) => Math.max(0.5, prev - 0.25))}
            className="size-7 p-0"
          >
            <ZoomOut className="size-3" />
          </Button>
          <span className="text-muted-foreground w-12 text-center text-xs">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={(): void => setZoom((prev) => Math.min(3, prev + 0.25))}
            className="size-7 p-0"
          >
            <ZoomIn className="size-3" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-muted/5">
        <div className="min-w-fit p-4">
          <canvas
            ref={canvasRef}
            style={{
              width: Math.max(800, timelineWidth + 100),
              height: 80,
            }}
            className="border-border cursor-pointer rounded border bg-background shadow-sm"
            onClick={handleCanvasClick}
          />
        </div>
      </div>

      <div className="border-border border-t p-3 bg-background">
        <div className="flex flex-wrap gap-2">
          {events.map((event) => (
            <div
              key={event.id}
              className="bg-muted hover:bg-muted/80 flex items-center gap-2 rounded px-2 py-1 text-xs transition-colors"
            >
              {renderActionIcon(event.action)}
              <span className="font-medium">{event.target}</span>
              <span className="text-muted-foreground font-mono">
                {Math.floor(event.time / 60)}:
                {(event.time % 60).toString().padStart(2, "0")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
