import type { FC } from "react"
import type { Options as ChatMessageOptions } from "@chat/components/chat-message"
import { ChatMessage } from "@chat/components/chat-message"
import { cn } from "some-ui-utils"

type ChatMessagesProps = {
  messages: Array<ChatMessageOptions>
  className?: string
}

export const ChatMessages: FC<ChatMessagesProps> = ({
  className,
  messages = [],
}) => {
  return (
    <main
      className={cn(
        "relative flex size-full flex-col gap-y-3 rounded-b-xl p-3 shadow-md",
        className
      )}
    >
      <div className="absolute inset-0 h-1/4 border border-red-500" />
      <div className="absolute bottom-0 end-0 start-0  h-1/4  rounded-b-xl border border-red-500" />
      {messages.map((msg) => {
        const { character, id } = msg
        return (
          <section
            key={id}
            className={cn("flex h-full flex-1", {
              "justify-start": character === "pgdev",
              "justify-end": character === "ai",
            })}
          >
            <ChatMessage key={id} message={msg} />
          </section>
        )
      })}
    </main>
  )
}
