import { useEffect, useState } from "react"

type Notification = {
  id: number
  title: string
  description: string
}

export function useToastBurst(
  notifications: Array<Notification>,
  isPlaying: boolean
): Array<Notification> {
  const [activeToasts, setActiveToasts] = useState<Array<Notification>>([])

  useEffect(() => {
    if (!isPlaying) return

    const timeoutIds: Array<ReturnType<typeof setTimeout>> = []

    const startBurst = (): void => {
      setActiveToasts([])

      notifications.forEach((notification, index) => {
        const timeoutId = setTimeout(() => {
          setActiveToasts((prev) => [...prev, notification])

          const removeTimeoutId = setTimeout(() => {
            setActiveToasts((prev) =>
              prev.filter((t) => t.id !== notification.id)
            )
          }, 4000)

          timeoutIds.push(removeTimeoutId)
        }, index * 300)

        timeoutIds.push(timeoutId)
      })

      const restartTimeoutId = setTimeout(
        () => {
          startBurst()
        },
        notifications.length * 300 + 5000
      )

      timeoutIds.push(restartTimeoutId)
    }

    startBurst()

    return (): void => {
      timeoutIds.forEach(clearTimeout)
    }
  }, [notifications, isPlaying])

  return activeToasts
}
