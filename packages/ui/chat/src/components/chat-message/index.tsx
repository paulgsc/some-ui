import { useTypingEffect } from "@chat/hooks/use-typing-effect"
import type { ChatMessageProps } from "@chat/types/chat"
import { Badge, WithAvatar } from "some-ui-shared"
import { cn, formatRelativeTime } from "some-ui-utils"

export const ChatMessage = ({
  avatarSize = 25,
  avatar,
  content,
  timestamp,
  position,
}: ChatMessageProps): React.JSX.Element => {
  const displayedContent = useTypingEffect({ content })
  return (
    <section
      className={cn(
        "relative flex size-fit max-w-[75%] flex-col rounded-lg p-1.5 shadow-lg",
        {
          "bg-indigo-500/20 shadow-indigo-500/50 items-end":
            position === "right",
          "bg-sky-200 shadow-sky-300": position === "left",
        }
      )}
    >
      <div
        className={cn("flex items-end space-x-6", {
          "flex-row-reverse": position === "right",
        })}
      >
        <WithAvatar
          className={cn("pointer-events-none z-10 shrink-0 brightness-75")}
          avatarSize={avatarSize}
          avatar={avatar}
        />

        <p
          className={cn(
            "inset-shadow-sm flex-1 break-words rounded-sm p-2.5 text-sm font-medium tracking-tight"
          )}
        >
          {displayedContent}
        </p>
      </div>
      <Badge
        className={cn(
          "text-muted-foreground/60 size-fit max-w-xs shrink-0 overflow-clip border-none p-0.5 text-xs tracking-tight",
          {
            "bg-inherit text-accent-foreground/40": position === "left",
          }
        )}
        variant={position === "right" ? "outline" : "secondary"}
      >
        {formatRelativeTime(timestamp)}
      </Badge>
    </section>
  )
}
