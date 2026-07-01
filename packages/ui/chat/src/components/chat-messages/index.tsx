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
  const priorityCounter = useRef<number>(0)
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false)

  const { speak, isActive, currentItem } = useSpeechQueue(COMPONENT_ID)

  const { chats, currentIndex, onPause, onResume } = useChatMessages({
    chats: messages,
  })

  useEffect(() => {
    const currentChat = chats[currentIndex - 1]
    if (!currentChat || isSpeaking) {
      return
    }

    const { content } = currentChat
    const currentItem = { index: currentIndex - 1, content }

    // Don't speak the same content again
    if (
      lastSpokenRef.current?.index === currentItem.index &&
      lastSpokenRef.current.content === currentItem.content
    ) {
      return
    }

    const speakContent = async (): Promise<void> => {
      try {
        lastSpokenRef.current = currentItem
        const options = {
          volume: 1.0,
          onStart: (): void => {
            setIsSpeaking(true)
            onPause()
          },
          onEnd: (): void => {
            setIsSpeaking(false)
            onResume()
          },
          onError: (error: Error): void => {
            setIsSpeaking(false)
            // eslint-disable-next-line no-console
            console.error("TTS Error:", error)
          },
        }

        // increment counter for each speak invocation
        const priority = ++priorityCounter.current
        await speak(content, options, priority)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to announce topic:", error)
        setIsSpeaking(false)
      }
    }

    speakContent()
  }, [chats, currentIndex, isSpeaking, speak, onResume, onPause])

  useEffect(() => {
    const { componentId } = currentItem ?? {}
    if (isActive && componentId !== COMPONENT_ID) onPause()
    if (!isActive) onResume()
  }, [currentItem, onPause, onResume, isActive])

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
      {chats.map((msg, i) => {
        const { position, id } = msg
        const t = 15 * 1000
        const timestamp = new Date(Date.now() - t).toString()
        return (
          <section
            key={`${id}_${i}`}
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
