import { useState } from "react"
import { ErrorDisplay } from "@input/components/payload-editor/error-display"
import { EventBuilderForm } from "@input/components/payload-editor/event-builder-form"
import { EventPreview } from "@input/components/payload-editor/event-preview"
import { PayloadEditorCard } from "@input/components/payload-editor/payload-editor-card"
import { SendButton } from "@input/components/payload-editor/send-button"
import type {
  Context,
  EventType,
  TimelineEvent,
} from "@input/types/timeline-events"
import {
  generateUID,
  getCurrentTimestamp,
  validateAndParseJson,
} from "@input/utils/event-helpers"

export const TimelineEditor = () => {
  const [eventType, setEventType] = useState<EventType>("StartChapter")
  const [uid, setUid] = useState("")
  const [context, setContext] = useState<Context>({ title: "", tags: {} })
  const [timestamp, setTimestamp] = useState("")
  const [payloadJson, setPayloadJson] = useState(
    '{\n  "description": "Example payload data",\n  "viewer_count": 42\n}'
  )
  const [metadataJson, setMetadataJson] = useState("{}")
  const [useCurrentTime, setUseCurrentTime] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [lastSentEvent, setLastSentEvent] = useState<TimelineEvent | null>(null)
  const [jsonError, setJsonError] = useState("")

  const buildEvent = (): TimelineEvent => {
    const baseTimestamp = useCurrentTime
      ? getCurrentTimestamp()
      : Number.parseInt(timestamp) || 0
    const event: TimelineEvent = { type: eventType }

    // Add UID for events that need it
    if (eventType !== "ClearAll") {
      event.uid = uid || generateUID()
    }

    switch (eventType) {
      case "StartChapter":
        event.context = context
        event.start_time = baseTimestamp
        if (payloadJson.trim()) {
          const data = validateAndParseJson(payloadJson)
          const metadata = metadataJson.trim()
            ? validateAndParseJson(metadataJson)
            : undefined
          event.payload = { data, metadata }
        }
        break

      case "EndChapter":
        event.end_time = baseTimestamp
        if (payloadJson.trim()) {
          const data = validateAndParseJson(payloadJson)
          const metadata = metadataJson.trim()
            ? validateAndParseJson(metadataJson)
            : undefined
          event.final_payload = { data, metadata }
        }
        break

      case "UpdatePayload":
        const data = validateAndParseJson(payloadJson)
        const metadata = metadataJson.trim()
          ? validateAndParseJson(metadataJson)
          : undefined
        event.payload = { data, metadata }
        break

      case "UpdateContext":
        event.context = context
        break

      case "ExtendChapter":
        event.extend_to = baseTimestamp
        break

      case "CompleteChapter":
        event.completion_time = baseTimestamp
        const finalData = validateAndParseJson(payloadJson)
        const finalMetadata = metadataJson.trim()
          ? validateAndParseJson(metadataJson)
          : undefined
        event.final_payload = { data: finalData, metadata: finalMetadata }
        break

      case "RemoveChapter":
      case "ClearAll":
        // No additional fields needed
        break
    }

    return event
  }

  const handleSendEvent = async () => {
    try {
      setJsonError("")
      setIsLoading(true)

      const event = buildEvent()

      // Mock API call
      await new Promise((resolve) => setTimeout(resolve, 1000))

      setLastSentEvent(event)
      console.log("Event sent:", event)

      // Reset form for new event
      if (eventType === "StartChapter") {
        setUid("")
        setContext({ title: "", tags: {} })
      }
    } catch (error) {
      setJsonError(
        error instanceof Error ? error.message : "Unknown error occurred"
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold">Timeline Event Manager</h1>
        <p className="text-muted-foreground">
          Create and send events to your live chapters timeline system
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <EventBuilderForm
          eventType={eventType}
          onEventTypeChange={setEventType}
          uid={uid}
          onUidChange={setUid}
          context={context}
          onContextChange={setContext}
          useCurrentTime={useCurrentTime}
          onUseCurrentTimeChange={setUseCurrentTime}
          timestamp={timestamp}
          onTimestampChange={setTimestamp}
        />

        <PayloadEditorCard
          eventType={eventType}
          payloadJson={payloadJson}
          onPayloadJsonChange={setPayloadJson}
          metadataJson={metadataJson}
          onMetadataJsonChange={setMetadataJson}
        />
      </div>

      <ErrorDisplay error={jsonError} />

      <SendButton
        eventType={eventType}
        isLoading={isLoading}
        onClick={handleSendEvent}
      />

      <EventPreview event={lastSentEvent} />
    </div>
  )
}
