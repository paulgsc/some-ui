import type { RefObject } from "react"
import { useEffect, useRef } from "react"

type Options = {
  text: string
  number: number
}

export function useAnimatedSteps(steps: Array<Options>): {
  containerRef: RefObject<HTMLDivElement | null>
  beamRef: RefObject<SVGPathElement | null>
} {
  const containerRef = useRef<HTMLDivElement>(null)
  const beamRef = useRef<SVGPathElement>(null)

  useEffect(() => {
    const animate = async (): Promise<void> => {
      if (!containerRef.current || !beamRef.current) return

      const startAnimation = async (index: number): Promise<void> => {
        const step = containerRef.current?.querySelector(
          `[data-step="${index}"]`
        ) as HTMLElement
        const badge = containerRef.current?.querySelector(
          `[data-badge="${index}"]`
        ) as HTMLElement

        if (!step || !badge || !beamRef.current) return

        step.classList.add(
          index % 2 === 0 ? "animate-slide-in-left" : "animate-slide-in-right"
        )

        await new Promise((resolve) => setTimeout(resolve, 800))
        badge.classList.add("animate-bounce-in")

        await new Promise((resolve) => setTimeout(resolve, 400))

        const beamLength = beamRef.current.getTotalLength()
        beamRef.current.style.strokeDasharray = `${beamLength}`
        beamRef.current.style.strokeDashoffset = `${beamLength}`

        const startTime = performance.now()
        const duration = 1500

        const animateBeam = (currentTime: number): void => {
          const elapsed = currentTime - startTime
          const progress = Math.min(elapsed / duration, 1)

          beamRef.current!.style.strokeDashoffset = `${beamLength - beamLength * progress}`

          if (progress < 1) {
            requestAnimationFrame(animateBeam)
          } else if (index < steps.length - 1) {
            setTimeout(() => startAnimation(index + 1), 200)
          }
        }

        requestAnimationFrame(animateBeam)
      }

      setTimeout(() => startAnimation(0), 1000)
    }

    animate()
  }, [steps])

  return { containerRef, beamRef }
}
