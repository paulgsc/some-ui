import { useCallback, useEffect, useRef, useState } from "react"
import type { Message } from "@chat/types/chat"

type Options = {
  chats: Array<Message>
  pause?: boolean
}

type ReturnOptions = {
  currentIndex: number
} & Options

export function useChatMessages({ chats, pause }: Options): ReturnOptions {
  const [messages, setMessages] = useState<Array<Message>>([])
  const [currentIndex, setCurrentIndex] = useState(0)
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
    }, 10 * 1000)
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
    currentIndex,
  }
}
