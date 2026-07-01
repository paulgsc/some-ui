import { useEffect, useState } from "react"

export function useCurrentTime(): string {
  const [time, setTime] = useState("")

  useEffect((): (() => void) => {
    const updateTime = (): void => {
      const now = new Date()
      const timeString = now.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      })
      setTime(timeString)
    }

    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  return time
}
