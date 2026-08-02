import type { JSX } from "react"
import {
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@some-ui/shared"
import { AlertCircle } from "lucide-react"

type EditorProps = {
  payloadJson: string
  onPayloadJsonChange: (value: string) => void
  metadataJson: string
  onMetadataJsonChange: (value: string) => void
  show: boolean
  eventType: string
}

export const Editor = ({
  payloadJson,
  onPayloadJsonChange,
  metadataJson,
  onMetadataJsonChange,
  show,
  eventType,
}: EditorProps): JSX.Element => {
  if (!show) {
    return (
      <div className="text-muted-foreground py-8 text-center">
        <AlertCircle className="mx-auto mb-2 size-8" />
        <p>No payload configuration needed for {eventType}</p>
      </div>
    )
  }

  return (
    <Tabs defaultValue="payload" className="space-y-4">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="payload">Payload Data</TabsTrigger>
        <TabsTrigger value="metadata">Metadata</TabsTrigger>
      </TabsList>

      <TabsContent value="payload" className="space-y-2">
        <Label>JSON Data</Label>
        <Textarea
          value={payloadJson}
          onChange={(e) => onPayloadJsonChange(e.target.value)}
          placeholder="Enter JSON payload data..."
          className="min-h-[200px] font-mono text-sm"
        />
      </TabsContent>

      <TabsContent value="metadata" className="space-y-2">
        <Label>Metadata (Optional)</Label>
        <Textarea
          value={metadataJson}
          onChange={(e) => onMetadataJsonChange(e.target.value)}
          placeholder='{"key": "value"}'
          className="min-h-[200px] font-mono text-sm"
        />
      </TabsContent>
    </Tabs>
  )
}
