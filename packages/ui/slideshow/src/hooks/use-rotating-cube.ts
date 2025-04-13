import { useCallback, useEffect, useRef, useState } from "react"
import type { Range as ValidNumbers } from "some-types-utils"

type Face = ValidNumbers<6>
type RotationAxis = "X-axis" | "Y-axis"
export type AllowedRotationAxis = RotationAxis | "All"
type Rotation = {
  axis: RotationAxis
  face: Face
}
type RotationState = {
  face: Face
  xRotation: number
  yRotation: number
}

export type Mode = "autoplay" | "manual"

type Options = {
  dof?: AllowedRotationAxis
  duration?: number
  mode?: Mode
}

type ReturnOptions = {
  isRotating: boolean
  rotationAxis: RotationAxis
  setIsRotating: (arg: boolean) => void
  rotationState: RotationState
  rotateCube: () => void
  rotateToFace: (targetFace: Face) => void
  rotateNext: () => void
  rotatePrev: () => void
  onTogglePause: () => void
}

// Define adjacency map for each face with valid rotations
const FACE_GRAPH: Record<Face, Record<RotationAxis, Face>> = {
  0: { "X-axis": 4, "Y-axis": 1 }, // Front -> Top/Right
  1: { "X-axis": 4, "Y-axis": 2 }, // Right -> Top/Back
  2: { "X-axis": 4, "Y-axis": 3 }, // Back -> Top/Left
  3: { "X-axis": 4, "Y-axis": 0 }, // Left -> Top/Front
  4: { "X-axis": 2, "Y-axis": 1 }, // Top -> Back/Right
  5: { "X-axis": 0, "Y-axis": 1 }, // Bottom -> Front/Right
}

// Define cycle sequences for single-axis rotations
const ROTATION_CYCLES: Record<RotationAxis, Array<Face>> = {
  "X-axis": [0, 5, 2, 4], // Front -> Top -> Back -> Bottom
  "Y-axis": [0, 3, 2, 1], // Front -> Right -> Back -> Left
}

const getNextFaceInCycle = (currentFace: Face, axis: RotationAxis): Face => {
  const cycle = ROTATION_CYCLES[axis]
  const currentIndex = cycle.indexOf(currentFace)
  return cycle[(currentIndex + 1) % cycle.length]
}

const getPrevFaceInCycle = (currentFace: Face, axis: RotationAxis): Face => {
  const cycle = ROTATION_CYCLES[axis].reverse()
  const currentIndex = cycle.indexOf(currentFace)
  return cycle[Math.abs(currentIndex + 1) % cycle.length]
}

export const useRotatingCube = ({
  dof = "Y-axis",
  duration = 10000,
  mode = "autoplay",
}: Options): ReturnOptions => {
  const [isRotating, setIsRotating] = useState<boolean>(false)
  const [isPaused, setIsPaused] = useState<boolean>(false)
  const [rotationState, setRotationState] = useState<RotationState>({
    face: 0,
    xRotation: 0,
    yRotation: 0,
  })
  const [rotationAxis, setRotationAxis] = useState<RotationAxis>("Y-axis")
  const intervalRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )

  const chooseRotationAxis = useCallback((): void => {
    switch (dof) {
      case "Y-axis":
      case "X-axis":
        setRotationAxis(dof)
        break
      case "All":
        setRotationAxis(Math.random() < 0.5 ? "X-axis" : "Y-axis")
        break
      default:
        dof satisfies never
    }
  }, [dof])

  const getRotationPath = useCallback(
    (startFace: Face, targetFace: Face): Array<Rotation> => {
      if (startFace === targetFace) return []
      const cycles = ROTATION_CYCLES[rotationAxis]

      // For single-axis rotations, follow the predefined cycle
      if (cycles.includes(startFace) && cycles.includes(targetFace)) {
        const path: Array<Rotation> = []
        let currentFace = startFace

        while (currentFace !== targetFace) {
          const nextFace = getNextFaceInCycle(currentFace, rotationAxis)
          path.push({ axis: rotationAxis, face: nextFace })
          currentFace = nextFace
        }
        return path
      }

      // For other cases, use BFS to find shortest path
      const queue: Array<{ face: Face; path: Array<Rotation> }> = [
        { face: startFace, path: [] },
      ]
      const visited = new Set<Face>([startFace])

      while (queue.length > 0) {
        const { face, path } = queue.shift()!

        // Try preferred axis first
        const axes: Array<RotationAxis> = [
          rotationAxis,
          rotationAxis === "X-axis" ? "Y-axis" : "X-axis",
        ]

        for (const axis of axes) {
          const nextFace = FACE_GRAPH[face][axis]

          if (!visited.has(nextFace)) {
            const newPath = [...path, { axis, face: nextFace }]

            if (nextFace === targetFace) {
              return newPath
            }

            visited.add(nextFace)
            queue.push({ face: nextFace, path: newPath })
          }
        }
      }

      return [] // Should never happen with a valid cube
    },
    [rotationAxis]
  )

  const rotateCube = useCallback(
    (reverse: boolean = false) => {
      setRotationState((prev) => {
        let targetFace: Face

        if (dof === "All") {
          // Choose random target face for dual-axis rotation
          const possibleFaces: Array<Face> = [0, 1, 2, 3, 4, 5]
          targetFace = possibleFaces[Math.floor(Math.random() * 6)]
        } else {
          // Get next face in cycle for single-axis rotation
          targetFace = reverse
            ? getPrevFaceInCycle(prev.face, rotationAxis)
            : getNextFaceInCycle(prev.face, rotationAxis)
        }

        const rotations = getRotationPath(prev.face, targetFace)
        if (rotations.length === 0) return prev

        // Apply first rotation
        const firstRotation = rotations[0]
        const sign = reverse ? -1 : 1
        const newState = {
          face: firstRotation.face,
          xRotation:
            prev.xRotation + (firstRotation.axis === "X-axis" ? 90 : 0) * sign,
          yRotation:
            prev.yRotation + (firstRotation.axis === "Y-axis" ? 90 : 0) * sign,
        }

        // Queue subsequent rotations
        if (rotations.length > 1) {
          let delay = 500 // Match your transition time
          rotations.slice(1).forEach((rotation) => {
            setTimeout(() => {
              setRotationState((current) => {
                const delayedState = {
                  face: rotation.face,
                  xRotation:
                    current.xRotation +
                    (rotation.axis === "X-axis" ? 90 : 0) * sign,
                  yRotation:
                    current.yRotation +
                    (rotation.axis === "Y-axis" ? 90 : 0) * sign,
                }
                return {
                  ...delayedState,
                  xRotation: delayedState.xRotation % 360,
                  yRotation: delayedState.yRotation % 360,
                }
              })
            }, delay)
            delay += 500
          })
        }

        return {
          ...newState,
          xRotation: newState.xRotation % 360,
          yRotation: newState.yRotation % 360,
        }
      })
    },
    [dof, rotationAxis]
  )

  const rotateNext = useCallback(() => {
    if (intervalRef.current) clearTimeout(intervalRef.current)
    setIsPaused(true)
    rotateCube()
    if (mode === "autoplay") {
      onTogglePause()
    }
  }, [rotationAxis])

  const rotatePrev = useCallback(() => {
    if (intervalRef.current) clearTimeout(intervalRef.current)
    setIsPaused(true)
    rotateCube(true)
    if (mode === "autoplay") {
      onTogglePause()
    }
  }, [rotationAxis])

  const rotateToFace = useCallback(() => {
    if (intervalRef.current) clearTimeout(intervalRef.current)
    setIsPaused(true)
    rotateCube()
    if (mode === "autoplay") {
      onTogglePause()
    }
  }, [])

  const onTogglePause = useCallback(() => {
    setIsPaused((prev) => {
      if (intervalRef.current && !prev) {
        clearTimeout(intervalRef.current)
      }
      return !prev
    })
  }, [])

  useEffect(() => {
    chooseRotationAxis()
  }, [dof])

  useEffect(() => {
    if (isPaused) return
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = undefined
    }

    // Only set up interval if in autoplay mode
    if (mode === "autoplay") {
      intervalRef.current = setInterval(() => {
        rotateCube()
      }, duration)
    }

    return (): void => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = undefined
      }
    }
  }, [isPaused, mode, duration, rotateCube])

  return {
    rotationAxis,
    rotationState,
    isRotating,
    setIsRotating,
    rotateCube,
    rotateToFace,
    rotateNext,
    rotatePrev,
    onTogglePause,
  }
}
