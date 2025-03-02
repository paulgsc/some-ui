import { useEffect, useState } from "react"
import type { ChatMessage } from "@chat/types/chat"

type Options = {
  chats: Array<ChatMessage>
}

export function useChatMessages({ chats }: Options): Options {
  const [messages, setMessages] = useState<Array<ChatMessage>>([])
  const [currentIndex, setCurrentIndex] = useState(0)

  // Load messages with a delay effect
  useEffect(() => {
    const interval = setInterval(() => {
      if (currentIndex < chats.length) {
        setMessages((prev) => [...prev, chats[currentIndex]])
        setCurrentIndex((prev) => prev + 1)
      } else {
        clearInterval(interval)
      }
    }, 10000)

    return (): void => clearInterval(interval)
  }, [currentIndex])

  return {
    chats: messages,
  }
}
