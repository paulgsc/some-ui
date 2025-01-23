import { Card, WithAvatar } from "some-ui-shared"
import type { AvatarOptions } from "some-ui-shared"
import { cn } from "some-ui-utils"

type MessageType = "chat" | "thinking"
type User = "ai" | "pgdev"

export type Options = {
  id: string
  character: User
  content: string
  type: MessageType
  timestamp: string
  avatar?: AvatarOptions
  avatarSize?: number
}

type ChatMessageProps = {
  message: Options
  isLatest: boolean
}

export const ChatMessage = ({
  message,
}: ChatMessageProps): React.JSX.Element => {
  const { timestamp, content, character, avatarSize = 30, avatar } = message
  return (
    <Card
      className={cn(
        "grid size-full max-w-sm grid-flow-row rounded-lg pt-0.5 shadow-md",
        {
          "bg-accent text-gray-900": character === "ai",
          "bg-blue-600 text-white": character === "pgdev",
        }
      )}
    >
      <section
        className={cn("row-span-2 flex flex-1 px-2 pt-0.5", {
          "justify-end": character === "pgdev",
          "justify-start": character === "ai",
        })}
      >
        {content}
      </section>
      <section className="relative shrink-0 p-0.5 text-start">
        {avatar && (
          <WithAvatar
            className={cn(
              "pointer-events-none absolute shrink-0 brightness-75",
              {
                "end-[95%] top-0": character === "ai",
                "start-[98%] top-0": character === "pgdev",
              }
            )}
            avatarSize={avatarSize}
            avatar={avatar}
          />
        )}
        <span
          className={cn(
            " flex h-full flex-1 items-end text-end text-xs text-muted/60",
            {
              "justify-start text-muted/50": character === "pgdev",
              "justify-end text-muted-foreground/60": character === "ai",
            }
          )}
        >
          {timestamp}
        </span>
      </section>
    </Card>
  )
}
