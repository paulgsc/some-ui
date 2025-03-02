import { useEffect, useState } from "react"
import { ChatMessage } from "@chat/types/chat"

type Options = {
  chats: Array<ChatMessage>
}

export function useChatMessages({ chats }: Options) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
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

    return () => clearInterval(interval)
  }, [currentIndex])

  // Add a function to send new messages
  const sendMessage = (content: string) => {
    const newMessage: ChatMessage = {
      id: String(Date.now()),
      character: "User",
      content,
      type: "chat",
      timestamp: "Just now",
      isBot: false,
    }

    setMessages((prev) => [...prev, newMessage])

    // Simulate bot response
    setTimeout(() => {
      const botResponse: ChatMessage = {
        id: String(Date.now() + 1),
        character: "Bot",
        content: "Thanks for your message! This is a simulated response.",
        type: "chat",
        timestamp: "Just now",
        isBot: true,
      }
      setMessages((prev) => [...prev, botResponse])
    }, 1000)
  }

  return {
    messages,
    sendMessage,
  }
}
