import { useEffect, useRef, useState } from "react"
import { Monitor, Play, Volume2, VolumeX, ZoomIn, ZoomOut } from "lucide-react"
import { Badge, Button } from "some-ui-shared"

type TimelineProps = {
  currentTime: number
  onTimeChange: (time: number) => void
  isPlaying: boolean
}

type TimelineEvent = {
  id: string
  time: number // in seconds
  duration: number
  action: string
  target: string
  label?: string
  color: string
}

export const Timeline = ({
  currentTime,
  onTimeChange,
  isPlaying,
}: TimelineProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [zoom, setZoom] = useState(1)
  const [isDragging, setIsDragging] = useState(false)

  // Mock timeline events
  const events: Array<TimelineEvent> = [
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
  ]

  const totalDuration = 150 // 2.5 minutes
  const pixelsPerSecond = 4 * zoom
  const timelineWidth = totalDuration * pixelsPerSecond

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw time ruler
    ctx.fillStyle = "#6b7280"
    ctx.font = "10px monospace"

    for (let i = 0; i <= totalDuration; i += 10) {
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

      // Event background
      ctx.fillStyle = event.color + "40"
      ctx.fillRect(x, y, width, height)

      // Event border
      ctx.strokeStyle = event.color
      ctx.lineWidth = 2
      ctx.strokeRect(x, y, width, height)

      // Event label
      ctx.fillStyle = "#ffffff"
      ctx.font = "11px sans-serif"
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
    ctx.lineTo(playheadX, 80)
    ctx.stroke()

    // Playhead handle
    ctx.fillStyle = "#ef4444"
    ctx.fillRect(playheadX - 4, 0, 8, 12)
  }, [currentTime, zoom, events, pixelsPerSecond, totalDuration, timelineWidth])

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const time = x / pixelsPerSecond
    onTimeChange(Math.max(0, Math.min(time, totalDuration)))
  }

  const getActionIcon = (action: string) => {
    switch (action) {
      case "scene":
        return <Monitor className="size-3" />
      case "play":
        return <Play className="size-3" />
      case "unmute":
        return <Volume2 className="size-3" />
      case "mute":
        return <VolumeX className="size-3" />
      default:
        return null
    }
  }

  return (
    <div className="bg-card flex h-full flex-col">
      {/* Timeline Header */}
      <div className="border-border flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Timeline</h3>
          <Badge variant="outline" className="text-xs">
            {Math.floor(currentTime / 60)}:
            {(Math.floor(currentTime) % 60).toString().padStart(2, "0")} / 2:30
          </Badge>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
            className="size-7 p-0"
          >
            <ZoomOut className="size-3" />
          </Button>
          <span className="text-muted-foreground px-2 text-xs">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoom(Math.min(3, zoom + 0.25))}
            className="size-7 p-0"
          >
            <ZoomIn className="size-3" />
          </Button>
        </div>
      </div>

      {/* Timeline Canvas */}
      <div className="flex-1 overflow-auto">
        <div className="p-4">
          <canvas
            ref={canvasRef}
            width={Math.max(800, timelineWidth + 100)}
            height={80}
            className="border-border cursor-pointer rounded border"
            onClick={handleCanvasClick}
          />
        </div>
      </div>

      {/* Event List */}
      <div className="border-border border-t p-3">
        <div className="flex flex-wrap gap-2">
          {events.map((event) => (
            <div
              key={event.id}
              className="bg-muted flex items-center gap-2 rounded px-2 py-1 text-xs"
            >
              {getActionIcon(event.action)}
              <span>{event.target}</span>
              <Badge variant="outline" className="text-xs">
                {Math.floor(event.time / 60)}:
                {(event.time % 60).toString().padStart(2, "0")}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
