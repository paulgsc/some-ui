import {
  EVENT_DESCRIPTIONS,
  type EventType,
} from "@input/types/timeline-events"
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "some-ui-shared"

type EventTypeSelectorProps = {
  value: EventType
  onChange: (value: EventType) => void
}

export const EventTypeSelector = ({
  value,
  onChange,
}: EventTypeSelectorProps) => {
  return (
    <div className="space-y-2">
      <Label htmlFor="event-type">Event Type</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(EVENT_DESCRIPTIONS).map(([type, description]) => (
            <SelectItem key={type} value={type}>
              <div>
                <div className="font-medium">{type}</div>
                <div className="text-muted-foreground text-xs">
                  {description}
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
