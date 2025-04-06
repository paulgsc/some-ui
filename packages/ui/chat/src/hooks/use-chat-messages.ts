import { useCallback, useEffect, useRef, useState } from "react"
import type { ChatMessageProps } from "@chat/types/chat"

type Options = {
  chats: Array<ChatMessageProps>
  pause?: boolean
}

export function useChatMessages({ chats, pause }: Options): Options {
  const [messages, setMessages] = useState<Array<ChatMessageProps>>([])
  const [_currentIndex, setCurrentIndex] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )

  const startAnimation = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    intervalRef.current = setInterval(() => {
      setCurrentIndex((prevIndex) => {
        const nextIndex = prevIndex + 1

        if (nextIndex < chats.length) {
          setMessages((prev) => [...prev, chats[prevIndex]])
          return nextIndex
        }
        setMessages([])
        return 0
      })
    }, 10000)
  }, [chats])

  useEffect(() => {
    if (pause) {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current)
      }
    } else {
      startAnimation()
    }
    return (): void => clearInterval(intervalRef.current)
  }, [pause])

  return {
    chats: messages,
  }
}
