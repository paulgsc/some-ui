import type { JSX } from "react"
import type { EventType } from "@input/types/timeline-events"
import { Button } from "@some-ui/shared"
import { Send } from "lucide-react"

type SendButtonProps = {
  eventType: EventType
  isLoading: boolean
  onClick: () => void
}

export const SendButton = ({
  eventType,
  isLoading,
  onClick,
}: SendButtonProps): JSX.Element => {
  return (
    <div className="flex justify-center">
      <Button
        onClick={onClick}
        disabled={isLoading}
        size="lg"
        className="gap-2"
      >
        {isLoading ? (
          <>
            <div className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Sending Event...
          </>
        ) : (
          <>
            <Send className="size-4" />
            Send {eventType} Event
          </>
        )}
      </Button>
    </div>
  )
}
