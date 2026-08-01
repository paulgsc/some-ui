import type { JSX } from "react"
import { ContextBuilder } from "@input/components/payload-editor/context-builder"
import { EventTypeSelector } from "@input/components/payload-editor/event-type-selector"
import { TimestampControl } from "@input/components/payload-editor/timestamp-control"
import { UIDSelector } from "@input/components/payload-editor/uid-selector"
import type { Context, EventType } from "@input/types/timeline-events"
import { getEventRequirements } from "@input/utils/event-helpers"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@some-ui/shared"
import { Hash } from "lucide-react"

type EventBuilderFormProps = {
  eventType: EventType
  onEventTypeChange: (value: EventType) => void
  uid: string
  onUidChange: (value: string) => void
  context: Context
  onContextChange: (value: Context) => void
  useCurrentTime: boolean
  onUseCurrentTimeChange: (value: boolean) => void
  timestamp: string
  onTimestampChange: (value: string) => void
}

export const EventBuilderForm = ({
  eventType,
  onEventTypeChange,
  uid,
  onUidChange,
  context,
  onContextChange,
  useCurrentTime,
  onUseCurrentTimeChange,
  timestamp,
  onTimestampChange,
}: EventBuilderFormProps): JSX.Element => {
  const requirements = getEventRequirements(eventType)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Hash className="size-5" />
          Event Builder
        </CardTitle>
        <CardDescription>
          Configure your timeline event parameters
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <EventTypeSelector value={eventType} onChange={onEventTypeChange} />

        <UIDSelector
          value={uid}
          onChange={onUidChange}
          show={requirements.needsUID}
        />

        <ContextBuilder
          value={context}
          onChange={onContextChange}
          show={requirements.needsContext}
        />

        <TimestampControl
          useCurrentTime={useCurrentTime}
          onUseCurrentTimeChange={onUseCurrentTimeChange}
          timestamp={timestamp}
          onTimestampChange={onTimestampChange}
          show={requirements.needsTimestamp}
        />
      </CardContent>
    </Card>
  )
}
