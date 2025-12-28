import { Editor } from "@input/components/payload-editor/editor"
import type { EventType } from "@input/types/timeline-events"
import { getEventRequirements } from "@input/utils/event-helpers"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "some-ui-shared"

type PayloadEditorCardProps = {
  eventType: EventType
  payloadJson: string
  onPayloadJsonChange: (value: string) => void
  metadataJson: string
  onMetadataJsonChange: (value: string) => void
}

export const PayloadEditorCard = ({
  eventType,
  payloadJson,
  onPayloadJsonChange,
  metadataJson,
  onMetadataJsonChange,
}: PayloadEditorCardProps) => {
  const requirements = getEventRequirements(eventType)
  const showPayloadEditor =
    requirements.needsPayload || requirements.needsFinalPayload

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payload Data</CardTitle>
        <CardDescription>
          {requirements.needsPayload &&
            "Configure the payload data for this event"}
          {requirements.needsFinalPayload &&
            "Configure the final payload data (optional)"}
          {!showPayloadEditor && "This event type doesn't require payload data"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Editor
          payloadJson={payloadJson}
          onPayloadJsonChange={onPayloadJsonChange}
          metadataJson={metadataJson}
          onMetadataJsonChange={onMetadataJsonChange}
          show={showPayloadEditor}
          eventType={eventType}
        />
      </CardContent>
    </Card>
  )
}
