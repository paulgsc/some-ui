import { useCallback, useEffect, useState } from "react"

export const useTextScramble = (initialText: string) => {
  const [text, setText] = useState(initialText)
  const [queue, setQueue] = useState<
    Array<{
      from: string
      to: string
      start: number
      end: number
      char?: string
    }>
  >([])
  const [frame, setFrame] = useState(0)

  const chars = "!<>-_\\/[]{}—=+*^?#"

  const scrambleText = useCallback(
    (newText: string) => {
      const oldText = text
      const length = Math.max(oldText.length, newText.length)
      const newQueue = []

      for (let i = 0; i < length; i++) {
        const from = oldText[i] || ""
        const to = newText[i] || ""
        const start = Math.floor(Math.random() * 40)
        const end = start + Math.floor(Math.random() * 40)
        newQueue.push({ from, to, start, end })
      }

      setQueue(newQueue)
      setFrame(0)
      setText(newText)
    },
    [text]
  )

  useEffect(() => {
    if (queue.length === 0) return

    const update = () => {
      let output = ""
      let complete = 0

      for (let i = 0; i < queue.length; i++) {
        let { from, to, start, end, char } = queue[i]
        if (frame >= end) {
          complete++
          output += to
        } else if (frame >= start) {
          if (!char || Math.random() < 0.28) {
            char = chars[Math.floor(Math.random() * chars.length)]
            queue[i] = { ...queue[i], char }
          }
          output += `<span class="dud">${char}</span>`
        } else {
          output += from
        }
      }

      setText(output)
      if (complete === queue.length) {
        setQueue([])
      } else {
        setFrame(frame + 1)
      }
    }

    const frameRequest = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frameRequest)
  }, [frame, queue])

  return { text, scrambleText }
}
