import type { CSSProperties, FC } from "react"
import { ChatMessage } from "@chat/components/chat-message"
import { useChatMessages } from "@chat/hooks/use-chat-messages"
import type { ChatMessageProps } from "@chat/types/chat"
import { cn } from "some-ui-utils"

type ChatMessagesProps = {
  messages: Array<ChatMessageProps>
  className?: string
  height?: number
  pause?: boolean
}

export const ChatMessages: FC<ChatMessagesProps> = ({
  className,
  height,
  pause,
  messages = [],
}) => {
  const { chats } = useChatMessages({ pause, chats: messages })
  return (
    <main
      style={
        {
          "--chat-messages-height": `${height ?? 0}px`,
        } as CSSProperties
      }
      className={cn(
        "relative flex size-full flex-col justify-end gap-y-3 overflow-clip rounded-b-xl bg-rose-100 p-3 shadow-md",
        {
          "h-[var(--chat-messages-height)]": height !== undefined,
        },
        className
      )}
    >
      <div className="absolute inset-0 h-1/4" />
      <div className="absolute bottom-0 end-0 start-0  h-1/4" />
      {chats.map((msg) => {
        const { character, id } = msg
        const t = 15 * 1000
        const timestamp = new Date(Date.now() - t).toString()
        return (
          <section
            key={id}
            className={cn("flex w-full", {
              "justify-start": character === "pgdev",
              "justify-end": character === "ai",
            })}
          >
            <ChatMessage key={id} {...{ ...msg, timestamp }} />
          </section>
        )
      })}
    </main>
  )
}
