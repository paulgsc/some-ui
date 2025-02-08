import { Badge, WithAvatar } from "some-ui-shared"
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
  avatar: AvatarOptions
  avatarSize?: number
}

type ChatMessageProps = {
  message: Options
}

export const ChatMessage = ({
  message,
}: ChatMessageProps): React.JSX.Element => {
  const { timestamp, content, character, avatarSize = 25, avatar } = message
  return (
    <section
      className={cn("relative flex size-fit max-w-[75%] flex-col pt-0.5", {
        "items-end": character === "ai",
      })}
    >
      <div
        className={cn("flex items-end space-x-6", {
          "flex-row-reverse": character === "ai",
        })}
      >
        <WithAvatar
          className={cn("pointer-events-none z-10 shrink-0 brightness-75")}
          avatarSize={avatarSize}
          avatar={avatar}
        />

        <p
          className={cn(
            "flex-1 break-words rounded-lg p-2.5 text-sm font-medium tracking-tight shadow-inner",
            {
              "bg-sky-100": character === "pgdev",
              "bg-muted/50": character === "ai",
            }
          )}
        >
          {content}
        </p>
      </div>
      <Badge
        className={cn(
          "size-fit max-w-xs shrink-0 overflow-clip p-0.5 text-xs tracking-tight text-muted-foreground/60",
          {
            "bg-inherit text-accent-foreground/40": character === "pgdev",
          }
        )}
        variant={character === "ai" ? "outline" : "secondary"}
      >
        {timestamp}
      </Badge>
    </section>
  )
}
