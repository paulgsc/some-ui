import { getCurrentTimestamp } from "@input/utils/event-helpers"
import { Clock } from "lucide-react"
import { Input, Label, Separator, Switch } from "some-ui-shared"

type TimestampControlProps = {
  useCurrentTime: boolean
  onUseCurrentTimeChange: (value: boolean) => void
  timestamp: string
  onTimestampChange: (value: string) => void
  show: boolean
}

export const TimestampControl = ({
  useCurrentTime,
  onUseCurrentTimeChange,
  timestamp,
  onTimestampChange,
  show,
}: TimestampControlProps): React.JSX.Element | null => {
  if (!show) return null

  return (
    <div className="space-y-4">
      <Separator />
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Timestamp</Label>
          <div className="flex items-center gap-2">
            <Switch
              checked={useCurrentTime}
              onCheckedChange={onUseCurrentTimeChange}
            />
            <Label className="text-sm">Use current time</Label>
          </div>
        </div>
        {!useCurrentTime && (
          <Input
            type="number"
            value={timestamp}
            onChange={(e) => onTimestampChange(e.target.value)}
            placeholder="Timestamp in milliseconds"
          />
        )}
        {useCurrentTime && (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Clock className="size-4" />
            Current: {getCurrentTimestamp()}ms
          </div>
        )}
      </div>
    </div>
  )
}
