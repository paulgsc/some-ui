import { useCallback, useEffect, useRef, useState } from "react"

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

export const useAperture = (duration = 500): AperturePropertiesWithState => {
  const [properties, setProperties] =
    useState<AperturePropertiesWithState>(initialProperties)
  const startTimeRef = useRef<number | null>(null)
  const frameRef = useRef<number | null>(null)

  const animateProperties = useCallback(
    (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp
      }

      const elapsedTime = timestamp - startTimeRef.current
      const progress = Math.min(elapsedTime / duration, 1)

      const newProperties = Object.fromEntries(
        Object.entries(initialProperties).map(([key, initialValue]) => {
          const finalValue = finalProperties[key as keyof ApertureProperties]
          return [key, initialValue + (finalValue - initialValue) * progress]
        })
      ) as ApertureProperties

      const state = progress < 1 ? "progress" : "done"
      setProperties({ ...newProperties, state })

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animateProperties)
      }
    },
    [duration]
  )

  useEffect(() => {
    frameRef.current = requestAnimationFrame(animateProperties)

    return (): void => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current)
      }
    }
  }, [animateProperties])

  return properties
}
