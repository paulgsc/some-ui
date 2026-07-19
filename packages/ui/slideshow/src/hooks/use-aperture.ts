import { useEffect, useRef, useState } from "react"

type ApertureProperties = {
  topX: number
  rightX: number
  leftX: number
  rightY: number
  leftY: number
  apertureSize: number
  apertureRotation: number
  apertureOpacity: number
}

type AperturePropertiesWithState = {
  state?: "progress" | "done"
} & ApertureProperties

const initialProperties: ApertureProperties = {
  topX: 50,
  rightX: 86.6,
  leftX: 13.4,
  rightY: 25,
  leftY: 25,
  apertureSize: 30,
  apertureRotation: 0,
  apertureOpacity: 100,
}

const finalProperties: ApertureProperties = {
  topX: 50,
  rightX: 100,
  leftX: 0,
  rightY: 0,
  leftY: 0,
  apertureSize: 95,
  apertureRotation: 120,
  apertureOpacity: 0,
}

const lerp = (start: number, end: number, progress: number): number =>
  start + (end - start) * progress

const interpolateProperties = (progress: number): ApertureProperties => ({
  topX: lerp(initialProperties.topX, finalProperties.topX, progress),
  rightX: lerp(initialProperties.rightX, finalProperties.rightX, progress),
  leftX: lerp(initialProperties.leftX, finalProperties.leftX, progress),
  rightY: lerp(initialProperties.rightY, finalProperties.rightY, progress),
  leftY: lerp(initialProperties.leftY, finalProperties.leftY, progress),
  apertureSize: lerp(
    initialProperties.apertureSize,
    finalProperties.apertureSize,
    progress
  ),
  apertureRotation: lerp(
    initialProperties.apertureRotation,
    finalProperties.apertureRotation,
    progress
  ),
  apertureOpacity: lerp(
    initialProperties.apertureOpacity,
    finalProperties.apertureOpacity,
    progress
  ),
})

export const useAperture = (duration = 500): AperturePropertiesWithState => {
  const [properties, setProperties] =
    useState<AperturePropertiesWithState>(initialProperties)

  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    let startTime: number | null = null

    const animate = (timestamp: number): void => {
      startTime ??= timestamp

      const elapsed = timestamp - startTime
      const progress = Math.min(elapsed / duration, 1)

      setProperties({
        ...interpolateProperties(progress),
        state: progress < 1 ? "progress" : "done",
      })

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate)
      }
    }

    frameRef.current = requestAnimationFrame(animate)

    return (): void => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
      }
    }
  }, [duration])

  return properties
}
