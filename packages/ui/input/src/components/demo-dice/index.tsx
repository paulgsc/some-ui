import type { JSX } from "react"
import { useEffect, useRef } from "react"
import { cubeEvents, DiceCard } from "some-ui-slideshow"
import { cn } from "some-ui-utils"

export const DemoDice = (): JSX.Element => {
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      cubeEvents.setState((prev) => {
        return {
          id: prev.id === "cube1" ? "cube2" : "cube1",
        }
      })
      cubeEvents.emit("rotate:next", { id: 1 })
    }, 5 * 1000)

    return (): void => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const content = Array.from({ length: 6 }, (_, i) => (
    <p key={i}>{`face ${i}`}</p>
  ))
  return (
    <div className="absolute inset-0">
      <main className="relative grid size-full grid-flow-col items-center justify-center gap-12 border border-red-500">
        <DiceCard
          className={cn("size-72 border border-red-500")}
          dof={"X-axis"}
          mode={"manual"}
          faces={content}
          cubeId="cube1"
        />
        <DiceCard
          className={cn("size-72 border border-red-500")}
          dof={"X-axis"}
          mode={"manual"}
          faces={content}
          cubeId="cube2"
        />
      </main>
    </div>
  )
}
