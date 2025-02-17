import { useEffect, useState } from "react"

type ApertureProperties = {
  topX: number
  rightX: number
  leftX: number
  rightY: number
  leftY: number
  apertureSize: number
  apertureRotation: number
}

const initialProperties: ApertureProperties = {
  topX: 50,
  rightX: 86.6,
  leftX: 13.4,
  rightY: 25,
  leftY: 25,
  apertureSize: 30,
  apertureRotation: 0,
}

const finalProperties: ApertureProperties = {
  topX: 50,
  rightX: 100,
  leftX: 0,
  rightY: 0,
  leftY: 0,
  apertureSize: 95,
  apertureRotation: 120,
}

export const useAperture = (duration = 500) => {
  const [properties, setProperties] =
    useState<ApertureProperties>(initialProperties)

  useEffect(() => {
    const startTime = Date.now()

    const animateProperties = () => {
      const elapsedTime = Date.now() - startTime
      const progress = Math.min(elapsedTime / duration, 1)

      const newProperties = Object.keys(initialProperties).reduce(
        (acc, key) => {
          const initialValue =
            initialProperties[key as keyof ApertureProperties]
          const finalValue = finalProperties[key as keyof ApertureProperties]
          acc[key as keyof ApertureProperties] =
            initialValue + (finalValue - initialValue) * progress
          return acc
        },
        {} as ApertureProperties
      )

      setProperties(newProperties)

      if (progress < 1) {
        requestAnimationFrame(animateProperties)
      }
    }

    requestAnimationFrame(animateProperties)
  }, [duration])

  return properties
}
