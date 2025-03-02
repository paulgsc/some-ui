import type { FC } from "react"
import { ChatMessage } from "@chat/components/chat-message"
import { useChatMessages } from "@chat/hooks/use-chat-messages"
import type { ChatMessage as ChatMessageType } from "@chat/types/chat"
import { cn } from "some-ui-utils"

type ChatMessagesProps = {
  messages: Array<ChatMessageType>
  className?: string
}

export const ChatMessages: FC<ChatMessagesProps> = ({
  className,
  messages = [],
}) => {
  const { chats } = useChatMessages({ chats: messages })
  return (
    <main
      className={cn(
        "relative flex size-full flex-col gap-y-3 rounded-b-xl p-3 shadow-md",
        className
      )}
    >
      <div className="absolute inset-0 h-1/4 border border-red-500" />
      <div className="absolute bottom-0 end-0 start-0  h-1/4  rounded-b-xl border border-red-500" />
      {chats.map((msg) => {
        const { character, id } = msg
        return (
          <section
            key={id}
            className={cn("flex w-full", {
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
