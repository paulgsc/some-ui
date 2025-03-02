import { useTypingEffect } from "@chat/hooks/use-typing-effect"
import { ChatMessage as ChatMessageType } from "@chat/types/chat"
import { Badge, WithAvatar } from "some-ui-shared"
import { cn } from "some-ui-utils"

type ChatMessageProps = {
  message: ChatMessageType
}

export const ChatMessage = ({ message }: ChatMessageProps) => {
  const { timestamp, content, character, avatarSize = 25, avatar } = message
  const displayedContent = useTypingEffect({ content })
  return (
    <section
      className={cn(
        "rounded-lg relative flex size-fit max-w-[75%] flex-col p-1.5 shadow-lg",
        {
          "bg-indigo-500/20 shadow-indigo-500/50 items-end": character === "ai",
          "bg-sky-200 shadow-sky-300": character === "pgdev",
        }
      )}
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
            "flex-1 break-words rounded-sm p-2.5 text-sm font-medium tracking-tight inset-shadow-sm"
          )}
        >
          {displayedContent}
        </p>
      </div>
      <Badge
        className={cn(
          "size-fit border-none max-w-xs shrink-0 overflow-clip p-0.5 text-xs tracking-tight text-muted-foreground/60",
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
