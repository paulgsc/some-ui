import { useCallback, useEffect, useState } from "react"

type Options = {
  currentFace: number
  isRotating: boolean
  totalRotation: number
  setIsRotating: (arg: boolean) => void
  rotateTo: (face: number) => void
}

export const useRotatingCube = (): Options => {
  const [isRotating, setIsRotating] = useState<boolean>(false)
  const [currentFace, setCurrentFace] = useState<number>(0)
  const [totalRotation, setTotalRotation] = useState<number>(0)

  const rotateTo = useCallback(
    (newFace: number) => {
      setCurrentFace(newFace)
      const newRotation = newFace * 90
      const diff = newRotation - (totalRotation % 360)
      const adjustedDiff =
        diff > 180 ? diff - 360 : diff < -180 ? diff + 360 : diff
      setTotalRotation((prevRotation) => prevRotation + adjustedDiff)
    },
    [totalRotation]
  )

  useEffect(() => {
    const interval = setInterval(() => {
      setIsRotating(true)
      rotateTo((currentFace + 1) % 4)
      setTimeout(() => setIsRotating(false), 500) // Assuming 500ms transition
    }, 10000) // Change face every 10 seconds
    return (): void => clearInterval(interval)
  }, [currentFace, rotateTo])

  return { currentFace, isRotating, totalRotation, setIsRotating, rotateTo }
}
