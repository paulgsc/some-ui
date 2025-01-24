import type { FC } from "react"
import type { Options as ChatMessageOptions } from "@chat/components"
import { ChatMessage } from "@chat/components"
import { cn } from "some-ui-utils"

type ChatMessagesProps = {
  messages: Array<ChatMessageOptions>
}

export const ChatMessages: FC<ChatMessagesProps> = ({ messages = [] }) => {
  return (
    <main className="relative flex h-[600px] w-[400px]  flex-col gap-y-3 rounded-xl bg-sky-50 p-3 shadow-md">
      <div className="absolute inset-0 h-1/4 rounded-t-xl border border-red-500" />
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
