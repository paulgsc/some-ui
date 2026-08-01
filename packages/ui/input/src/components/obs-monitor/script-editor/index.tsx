import type { JSX } from "react"
import { useState } from "react"
import {
  Clock,
  GripVertical,
  Monitor,
  Play,
  Plus,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react"
import {
  Badge,
  Button,
  Input,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@some-ui/shared"

type ScriptEvent = {
  id: string
  time: string
  action: string
  target: string
  params?: string
  label?: string
  manual: boolean
}

const ACTION_ICONS: Record<string, JSX.Element> = {
  scene: <Monitor className="size-4" />,
  play: <Play className="size-4" />,
  unmute: <Volume2 className="size-4" />,
  mute: <VolumeX className="size-4" />,
}

const getActionIcon = (action: string): JSX.Element =>
  ACTION_ICONS[action] ?? <Clock className="size-4" />

export const ScriptEditor = (): JSX.Element => {
  const [events, setEvents] = useState<Array<ScriptEvent>>([
    {
      id: "1",
      time: "0s",
      action: "scene",
      target: "Intro Scene",
      label: "Opening",
      manual: false,
    },
    {
      id: "2",
      time: "+5s",
      action: "play",
      target: "Theme Music",
      manual: false,
    },
    {
      id: "3",
      time: "+10s",
      action: "scene",
      target: "Main Camera",
      label: "Main Content",
      manual: false,
    },
    {
      id: "4",
      time: "cue",
      action: "unmute",
      target: "Microphone",
      label: "Start Talking",
      manual: true,
    },
  ])

  const addEvent = (): void => {
    const newEvent: ScriptEvent = {
      id: Date.now().toString(),
      time: "+0s",
      action: "scene",
      target: "",
      manual: false,
    }
    setEvents([...events, newEvent])
  }

  const removeEvent = (id: string): void => {
    setEvents(events.filter((event) => event.id !== id))
  }

  const updateEvent = <K extends keyof ScriptEvent>(
    id: string,
    field: K,
    value: ScriptEvent[K]
  ): void => {
    setEvents(
      events.map((event) =>
        event.id === id ? { ...event, [field]: value } : event
      )
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="border-border bg-muted/30 border-b p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={addEvent} className="gap-2">
              <Plus className="size-4" />
              Add Event
            </Button>
            <Badge variant="outline" className="text-xs">
              {events.length} events
            </Badge>
          </div>

          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <span>Total Duration: 2:30</span>
          </div>
        </div>
      </div>

      {/* Event Table */}
      <ScrollArea className="flex-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="w-20">Time</TableHead>
              <TableHead className="w-32">Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead className="w-32">Label</TableHead>
              <TableHead className="w-16">Manual</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.id} className="group">
                <TableCell>
                  <GripVertical className="text-muted-foreground size-4 cursor-grab" />
                </TableCell>

                <TableCell>
                  <Input
                    value={event.time}
                    onChange={(e) =>
                      updateEvent(event.id, "time", e.target.value)
                    }
                    className="h-8 font-mono text-xs"
                    placeholder="0s"
                  />
                </TableCell>

                <TableCell>
                  <Select
                    value={event.action}
                    onValueChange={(value) =>
                      updateEvent(event.id, "action", value)
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <div className="flex items-center gap-2">
                        {getActionIcon(event.action)}
                        <SelectValue />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scene">
                        <div className="flex items-center gap-2">
                          <Monitor className="size-4" />
                          Scene
                        </div>
                      </SelectItem>
                      <SelectItem value="play">
                        <div className="flex items-center gap-2">
                          <Play className="size-4" />
                          Play
                        </div>
                      </SelectItem>
                      <SelectItem value="unmute">
                        <div className="flex items-center gap-2">
                          <Volume2 className="size-4" />
                          Unmute
                        </div>
                      </SelectItem>
                      <SelectItem value="mute">
                        <div className="flex items-center gap-2">
                          <VolumeX className="size-4" />
                          Mute
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>

                <TableCell>
                  <Input
                    value={event.target}
                    onChange={(e) =>
                      updateEvent(event.id, "target", e.target.value)
                    }
                    className="h-8 text-xs"
                    placeholder="Select target..."
                  />
                </TableCell>

                <TableCell>
                  <Input
                    value={event.label || ""}
                    onChange={(e) =>
                      updateEvent(event.id, "label", e.target.value)
                    }
                    className="h-8 text-xs"
                    placeholder="Optional label"
                  />
                </TableCell>

                <TableCell>
                  <input
                    type="checkbox"
                    checked={event.manual}
                    onChange={(e) =>
                      updateEvent(event.id, "manual", e.target.checked)
                    }
                    className="border-border rounded"
                  />
                </TableCell>

                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeEvent(event.id)}
                    className="size-6 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Trash2 className="text-destructive size-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  )
}
