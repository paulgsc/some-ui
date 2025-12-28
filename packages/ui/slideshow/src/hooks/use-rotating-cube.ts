import { useCallback, useEffect, useRef, useState } from "react"
import type { Range as ValidNumbers } from "some-types-utils"
import { createEventBus } from "some-ui-utils"

type Unsubscribe = () => void
type CubeState = {
  id?: number | string
}
type CubeEventPayloads = {
  "rotate:next": { id?: number }
  "rotate:prev": { id?: number }
  "rotate:pause": { id?: number }
  "rotate:to": { id?: number; face: Face }
}

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
type RotateCubeOptions = {
  rotateTo?: Face
  reverse?: boolean
}

type Options = {
  dof?: AllowedRotationAxis
  duration?: number
  mode?: Mode
  cubeId?: number | string
}

type ReturnOptions = {
  isRotating: boolean
  rotationAxis: RotationAxis
  cubeState: CubeState
  setIsRotating: (arg: boolean) => void
  rotationState: RotationState
  rotateCube: ({ reverse, rotateTo }: RotateCubeOptions) => void
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

// Define reverse cycle sequences for prev operations
const REVERSE_ROTATION_CYCLES: Record<RotationAxis, Array<Face>> = {
  "X-axis": [0, 4, 2, 5], // Front -> Bottom -> Back -> Top
  "Y-axis": [0, 1, 2, 3], // Front -> Left -> Back -> Right
}

const getNextFaceInCycle = (currentFace: Face, axis: RotationAxis): Face => {
  const cycle = ROTATION_CYCLES[axis]
  const currentIndex = cycle.indexOf(currentFace)
  return cycle[(currentIndex + 1) % cycle.length]
}

const getPrevFaceInCycle = (currentFace: Face, axis: RotationAxis): Face => {
  const cycle = REVERSE_ROTATION_CYCLES[axis]
  const currentIndex = cycle.indexOf(currentFace)
  return cycle[(currentIndex + 1) % cycle.length]
}

export const useRotatingCube = ({
  cubeId,
  dof = "Y-axis",
  duration = 10000,
  mode = "autoplay",
}: Options): ReturnOptions => {
  const [isRotating, setIsRotating] = useState<boolean>(false)
  const [cubeState, setCubeState] = useState<CubeState>(() =>
    cubeEvents.getState()
  )
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
    (
      startFace: Face,
      targetFace: Face,
      reverse: boolean = false
    ): Array<Rotation> => {
      if (startFace === targetFace) return []
      const cycles = ROTATION_CYCLES[rotationAxis]

      // For single-axis rotations, follow the predefined cycle
      if (cycles.includes(startFace) && cycles.includes(targetFace)) {
        const path: Array<Rotation> = []
        let currentFace = startFace

        while (currentFace !== targetFace) {
          const nextFace = reverse
            ? getPrevFaceInCycle(currentFace, rotationAxis)
            : getNextFaceInCycle(currentFace, rotationAxis)
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
    ({ reverse, rotateTo }: RotateCubeOptions) => {
      setRotationState((prev) => {
        let targetFace: Face

        if (dof === "All") {
          // Choose random target face for dual-axis rotation
          const possibleFaces: Array<Face> = [0, 1, 2, 3, 4, 5]
          targetFace = possibleFaces[Math.floor(Math.random() * 6)]
        } else {
          // Get next face in cycle for single-axis rotation
          const getFace = (): Face =>
            reverse
              ? getPrevFaceInCycle(prev.face, rotationAxis)
              : getNextFaceInCycle(prev.face, rotationAxis)

          targetFace = rotateTo ?? getFace()
        }

        const rotations = getRotationPath(prev.face, targetFace, reverse)
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
    rotateCube({})
  }, [rotationAxis])

  const rotatePrev = useCallback(() => {
    rotateCube({ reverse: true })
  }, [rotationAxis])

  const rotateToFace = useCallback(
    (face: Face) => {
      stopAutoplay()
      rotateCube({ rotateTo: face })
      startAutoplay()
    },
    [rotationAxis]
  )

  const onTogglePause = useCallback(() => {
    stopAutoplay()
  }, [])

  const startAutoplay = useCallback(() => {
    if (mode !== "autoplay") return
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      rotateCube({})
    }, duration)
  }, [rotateCube, duration, mode])

  const stopAutoplay = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = undefined
    }
  }, [])

  useEffect(() => {
    chooseRotationAxis()
  }, [dof])

  useEffect(() => {
    if (mode === "autoplay") {
      startAutoplay()
    }
    return (): void => stopAutoplay()
  }, [mode, startAutoplay, stopAutoplay])

  useEffect(() => {
    const unsubscribers: Array<Unsubscribe> = []

    const unsubCube = cubeEvents.subscribe(
      (state) => state,
      (updatedState) => setCubeState(updatedState)
    )
    unsubscribers.push(unsubCube)

    return (): void => {
      unsubscribers.forEach((unsub) => unsub())
    }
  }, [cubeId, rotationAxis, cubeEvents])

  // Handle cube events
  useEffect(() => {
    const unsubscribers: Array<Unsubscribe> = [
      cubeEvents.subscribe((state) => state, setCubeState),

      cubeEvents.on("rotate:next", ({ id }) => {
        if (id === undefined || cubeId === id) rotateNext()
      }),

      cubeEvents.on("rotate:prev", ({ id }) => {
        if (id === undefined || cubeId === id) rotatePrev()
      }),

      cubeEvents.on("rotate:pause", ({ id }) => {
        if (id === undefined || cubeId === id) onTogglePause()
      }),

      cubeEvents.on("rotate:to", ({ face, id }) => {
        if (id === undefined || cubeId === id) rotateToFace(face)
      }),
    ]

    return (): void => {
      unsubscribers.forEach((unsub) => unsub())
    }
  }, [cubeId, rotateNext, rotatePrev, onTogglePause, rotateToFace])

  return {
    rotationAxis,
    rotationState,
    cubeState,
    isRotating,
    setIsRotating,
    rotateCube,
    rotateToFace,
    rotateNext,
    rotatePrev,
    onTogglePause,
  }
}

export const cubeEvents = createEventBus<CubeEventPayloads, CubeState>({})
