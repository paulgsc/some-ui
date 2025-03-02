import { useEffect, useState } from "react"

type Option = {
  content: string
  speed?: number
}

export function useTypingEffect({ content, speed = 20 }: Option) {
  const [displayedContent, setDisplayedContent] = useState("")

  useEffect(() => {
    // If typing effect should be applied
    let i = 0
    const interval = setInterval(() => {
      setDisplayedContent(content.slice(0, i))
      i++
      if (i > content.length) {
        clearInterval(interval)
      }
    }, speed)

    return () => clearInterval(interval)
  }, [content, speed])

  return displayedContent
}
