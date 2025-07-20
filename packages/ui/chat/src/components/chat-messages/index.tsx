import type { CSSProperties, FC } from "react"
import { useEffect, useRef } from "react"
import { ChatMessage } from "@chat/components/chat-message"
import { useChatMessages } from "@chat/hooks/use-chat-messages"
import type { Message } from "@chat/types/chat"
import { cn, useAudioTTS } from "some-ui-utils"

type ChatMessagesProps = {
  messages: Array<Message>
  className?: string
  height?: number
  pause?: boolean
}

export const ChatMessages: FC<ChatMessagesProps> = ({
  className,
  height,
  messages = [],
}) => {
  const lastSpokenRef = useRef<{ index: number; content: string } | null>(null)

  const {
    speak,
    speaking,
    voices,
    selectedVoice,
    stop: stopChat,
  } = useAudioTTS({
    service: {
      provider: "openai",
      apiUrl: "http://nixos.local:5050/v1/audio/speech",
      apiKey: "your_dummy_api_key_here",
      format: "mp3",
    },
    volume: 1.0,
    autoPlay: true, // Set to true for immediate playback
    onStart: () => {},
    onEnd: () => {},
    onError: (error) => {
      console.error("TTS Error:", error)
      stopChat()
    },
  })
  const { chats, currentIndex } = useChatMessages({
    pause: speaking,
    chats: messages,
  })

  useEffect(() => {
    const currentChat = chats[currentIndex - 1]
    if (!currentChat || speaking) {
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
      return
    }

    const speakContent = async () => {
      try {
        lastSpokenRef.current = currentItem
        await speak(content)
      } catch (error) {
        console.error("Failed to announce topic:", error)
      }
    }

    console.log(" Voices: ", voices, selectedVoice)
    speakContent()
  }, [chats, currentIndex, speak, speaking])

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
