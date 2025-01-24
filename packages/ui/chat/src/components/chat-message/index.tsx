import { Badge, Card, WithAvatar } from "some-ui-shared"
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
}

export const ChatMessage = ({
  message,
}: ChatMessageProps): React.JSX.Element => {
  const { timestamp, content, character, avatarSize = 25, avatar } = message
  return (
    <Card
      className={cn(
        "relative grid min-w-[45%] max-w-[75%]  grid-flow-row rounded-lg pt-0.5 shadow-inner",
        {
          "bg-accent text-gray-900": character === "ai",
          "bg-blue-600 text-white": character === "pgdev",
        }
      )}
    >
      <p
        className={cn(
          "z-10 row-span-2 flex flex-1 break-all bg-inherit pe-1.5 ps-3 pt-0.5 text-sm font-medium tracking-tight",
          {
            "justify-end": character === "pgdev",
            "justify-start": character === "ai",
          }
        )}
      >
        {content}
      </p>
      <section className="h-10 shrink-0 p-0.5 text-start">
        {avatar && (
          <WithAvatar
            className={cn(
              "pointer-events-none absolute z-0 shrink-0 brightness-75",
              {
                "end-[98%] top-0": character === "ai",
                "start-[98%] top-0": character === "pgdev",
              }
            )}
            avatarSize={avatarSize}
            avatar={avatar}
          />
        )}
        <span
          className={cn("flex h-full flex-1 shrink-0 items-end", {
            "justify-start text-muted/50": character === "pgdev",
            "justify-end text-muted-foreground/60": character === "ai",
          })}
        >
          <Badge
            className={cn(
              "shrink-0 p-0.5 text-xs tracking-tight text-muted-foreground/60",
              {
                "bg-inherit text-accent-foreground/40": character === "pgdev",
              }
            )}
            variant={character === "ai" ? "outline" : "secondary"}
          >
            {timestamp}
          </Badge>
        </span>
      </section>
    </Card>
  )
}
