import { Card, CardContent, CardFooter, WithAvatar } from "some-ui-shared"
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
  const { timestamp, content, character, avatarSize = 10, avatar } = message
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
      <CardContent
        className={cn("row-span-2 flex flex-1", {
          "justify-end": character === "pgdev",
          "justify-start": character === "ai",
        })}
      >
        {content}
      </CardContent>
      <CardFooter className="shrink-0 text-start">
        {avatar && <WithAvatar avatarSize={avatarSize} avatar={avatar} />}
        <span
          className={cn(" flex flex-1 text-xs text-muted/60", {
            "justify-start text-muted/50": character === "pgdev",
            "justify-end text-muted-foreground/60": character === "ai",
          })}
        >
          {timestamp}
        </span>
      </CardFooter>
    </Card>
  )
}
