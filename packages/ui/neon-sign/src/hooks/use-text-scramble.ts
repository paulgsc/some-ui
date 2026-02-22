import { useCallback, useEffect, useState } from "react"

type QueueItem = {
  from: string
  to: string
  start: number
  end: number
  char?: string
}

type ScrambleResult = {
  text: string
  scrambleText: (newText: string) => void
}

const SCRAMBLE_CHARS = "!<>-_\\/[]{}—=+*^?#"

export const useTextScramble = (initialText: string): ScrambleResult => {
  const [text, setText] = useState<string>(initialText)
  const [queue, setQueue] = useState<Array<QueueItem>>([])
  const [frame, setFrame] = useState<number>(0)

  const scrambleText = useCallback(
    (newText: string): void => {
      const oldText = text
      const length = Math.max(oldText.length, newText.length)
      const newQueue: Array<QueueItem> = []

      for (let i = 0; i < length; i++) {
        const from = oldText[i] ?? ""
        const to = newText[i] ?? ""
        const start = Math.floor(Math.random() * 40)
        const end = start + Math.floor(Math.random() * 40)
        newQueue.push({ from, to, start, end })
      }

      setQueue(newQueue)
      setFrame(0)
      // Note: We don't setText(newText) immediately here because
      // the animation needs to start from the oldText state.
    },
    [text]
  )

  useEffect(() => {
    if (queue.length === 0) return

    const update = (): void => {
      let output = ""
      let complete = 0
      const updatedQueue = [...queue]

      for (let i = 0; i < updatedQueue.length; i++) {
        // Safe access with a local variable to satisfy TS
        const item = updatedQueue[i]
        if (!item) continue

        let { from, to, start, end, char } = item

        if (frame >= end) {
          complete++
          output += to
        } else if (frame >= start) {
          if (!char || Math.random() < 0.28) {
            char =
              SCRAMBLE_CHARS[
                Math.floor(Math.random() * SCRAMBLE_CHARS.length)
              ] ?? "#"
            updatedQueue[i] = { ...item, char }
          }
          output += char
        } else {
          output += from
        }
      }

      setText(output)

      if (complete === updatedQueue.length) {
        setQueue([])
      } else {
        setQueue(updatedQueue)
        setFrame((prev) => prev + 1)
      }
    }

    const frameRequest = requestAnimationFrame(update)
    return (): void => cancelAnimationFrame(frameRequest)
  }, [frame, queue])

  return { text, scrambleText }
}
