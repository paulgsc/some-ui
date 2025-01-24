import { useEffect, useState } from "react"

type Options = {
  currentFace: number
  isRotating: boolean
  setIsRotating: (arg: boolean) => void
}

export const useRotatingCube = (): Options => {
  const [isRotating, setIsRotating] = useState<boolean>(false)
  const [currentFace, setCurrentFace] = useState<number>(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setIsRotating(!isRotating)
      setCurrentFace((prevFace) => (prevFace + 1) % 4)
    }, 10000) // Change face every 3 seconds
    return (): void => clearInterval(interval)
  }, [])

  return { currentFace, isRotating, setIsRotating }
}
