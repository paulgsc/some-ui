import { useCallback, useEffect, useRef, useState } from "react"
import type { Message } from "@chat/types/chat"

type Options = {
  chats: Array<Message>
  intervalMs?: number
}

type ReturnOptions = {
  chats: Array<Message>
  currentIndex: number
  start: () => void
  clear: () => void
  onPause: () => void
  onResume: () => void
}

export function useChatMessages({
  chats,
  intervalMs = 10_000,
}: Options): ReturnOptions {
  const [messages, setMessages] = useState<Array<Message>>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clear = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const tick = useCallback(() => {
    setCurrentIndex((prevIndex: number) => {
      const nextIndex = prevIndex + 1
      if (nextIndex < chats.length) {
        setMessages(chats.slice(0, nextIndex))
        return nextIndex
      }
      return 0
    })
  }, [chats])

  const start = useCallback(() => {
    clear()
    intervalRef.current = setInterval(tick, intervalMs)
  }, [tick, intervalMs, clear])

  // API
  const onPause = useCallback(() => {
    clear()
  }, [clear])

  const onResume = useCallback(() => {
    start()
  }, [start])

  useEffect(() => {
    start()
    return clear
  }, [start, clear])

  return {
    chats: messages,
    currentIndex,
    start,
    clear,
    onPause,
    onResume,
  }
}
