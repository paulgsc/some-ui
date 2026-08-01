import type { JSX } from "react"
import type { TimelineEvent } from "@input/types/timeline-events"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ScrollArea,
} from "@some-ui/shared"

type EventPreviewProps = {
  event: TimelineEvent | null
}

export const EventPreview = ({
  event,
}: EventPreviewProps): JSX.Element | null => {
  if (!event) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-green-600">
          ✓ Event Sent Successfully
        </CardTitle>
        <CardDescription>Last sent event preview</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px]">
          <pre className="bg-muted overflow-auto rounded-md p-4 text-sm">
            {JSON.stringify(event, null, 2)}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
