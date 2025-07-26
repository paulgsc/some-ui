import type { CSSProperties, FC } from "react"
import { useEffect, useRef, useState } from "react"
import { ChatMessage } from "@chat/components/chat-message"
import { useChatMessages } from "@chat/hooks/use-chat-messages"
import type { Message } from "@chat/types/chat"
import { cn, useSpeechQueue } from "some-ui-utils"

type ChatMessagesProps = {
  messages: Array<Message>
  className?: string
  height?: number
  pause?: boolean
}

const COMPONENT_ID = "chatbot"

export const ChatMessages: FC<ChatMessagesProps> = ({
  className,
  height,
  messages = [],
}) => {
  const lastSpokenRef = useRef<{ index: number; content: string } | null>(null)
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false)

  const { speak, queueStatus, isActive } = useSpeechQueue(COMPONENT_ID)

  const { chats, currentIndex } = useChatMessages({
    pause: isSpeaking,
    chats: messages,
  })

  useEffect(() => {
    const currentChat = chats[currentIndex - 1]
    if (!currentChat || isSpeaking) {
      console.log("claims we are still speaking", isSpeaking, currentChat)
      return
    }

    const { content } = currentChat
    const currentItem = { index: currentIndex - 1, content }

    // Don't speak the same content again
    if (
      lastSpokenRef.current &&
      lastSpokenRef.current.index === currentItem.index &&
      lastSpokenRef.current.content === currentItem.content
    ) {
      console.log("early return")
      return
    }

    const speakContent = async () => {
      console.log("this invoked!")
      try {
        lastSpokenRef.current = currentItem
        const options = {
          volume: 1.0,
          onStart: (): void => {
            setIsSpeaking(true)
          },
          onEnd: (): void => {
            setIsSpeaking(false)
          },
          onError: (error) => {
            console.error("TTS Error:", error)
          },
        }
        await speak(content, 0, options)
        console.log("we should have spoken", content)
      } catch (error) {
        console.error("Failed to announce topic:", error)
      }
    }

    speakContent()
  }, [chats, currentIndex, isSpeaking, speak])

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
        const { position, id } = msg
        const t = 15 * 1000
        const timestamp = new Date(Date.now() - t).toString()
        return (
          <section
            key={id}
            className={cn("flex w-full", {
              "justify-start": position === "left",
              "justify-end": position === "right",
            })}
          >
            <ChatMessage key={id} {...{ ...msg, timestamp }} />
          </section>
        )
      })}
    </main>
  )
}
