import { useCallback, useEffect, useState } from "react"
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

type Options = {
  dof?: AllowedRotationAxis
  duration?: number
}

type ReturnOptions = {
  isRotating: boolean
  rotationAxis: RotationAxis
  setIsRotating: (arg: boolean) => void
  rotationState: RotationState
  rotateCube: () => void
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
const ROTATION_CYCLES: Record<RotationAxis, Face[]> = {
  "X-axis": [0, 4, 2, 5], // Front -> Top -> Back -> Bottom
  "Y-axis": [0, 1, 2, 3], // Front -> Right -> Back -> Left
}

const getNextFaceInCycle = (currentFace: Face, axis: RotationAxis): Face => {
  const cycle = ROTATION_CYCLES[axis]
  const currentIndex = cycle.indexOf(currentFace)
  return cycle[(currentIndex + 1) % cycle.length]
}

const getRotationPath = (
  startFace: Face,
  targetFace: Face,
  preferredAxis: RotationAxis
): Rotation[] => {
  if (startFace === targetFace) return []

  // For single-axis rotations, follow the predefined cycle
  if (
    ROTATION_CYCLES[preferredAxis].includes(startFace) &&
    ROTATION_CYCLES[preferredAxis].includes(targetFace)
  ) {
    const path: Rotation[] = []
    let currentFace = startFace

    while (currentFace !== targetFace) {
      const nextFace = getNextFaceInCycle(currentFace, preferredAxis)
      path.push({ axis: preferredAxis, face: nextFace })
      currentFace = nextFace
    }

    return path
  }

  // For other cases, use BFS to find shortest path
  const queue: Array<{ face: Face; path: Rotation[] }> = [
    { face: startFace, path: [] },
  ]
  const visited = new Set<Face>([startFace])

  while (queue.length > 0) {
    const { face, path } = queue.shift()!

    // Try preferred axis first
    const axes: RotationAxis[] = [
      preferredAxis,
      preferredAxis === "X-axis" ? "Y-axis" : "X-axis",
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
}

export const useRotatingCube = ({
  dof = "Y-axis",
  duration = 10000,
}: Options): ReturnOptions => {
  const [isRotating, setIsRotating] = useState<boolean>(false)
  const [rotationState, setRotationState] = useState<RotationState>({
    face: 0,
    xRotation: 0,
    yRotation: 0,
  })
  const [rotationAxis, setRotationAxis] = useState<RotationAxis>("Y-axis")

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

  const rotateCube = useCallback(() => {
    setRotationState((prev) => {
      let targetFace: Face

      if (dof === "All") {
        // Choose random target face for dual-axis rotation
        const possibleFaces: Face[] = [0, 1, 2, 3, 4, 5]
        targetFace = possibleFaces[Math.floor(Math.random() * 6)] as Face
      } else {
        // Get next face in cycle for single-axis rotation
        targetFace = getNextFaceInCycle(prev.face, rotationAxis)
      }

      const rotations = getRotationPath(prev.face, targetFace, rotationAxis)
      if (rotations.length === 0) return prev

      // Apply first rotation
      const firstRotation = rotations[0]
      const newState = {
        face: firstRotation.face,
        xRotation: prev.xRotation + (firstRotation.axis === "X-axis" ? 90 : 0),
        yRotation: prev.yRotation + (firstRotation.axis === "Y-axis" ? 90 : 0),
      }

      // Queue subsequent rotations
      if (rotations.length > 1) {
        let delay = 500 // Match your transition time
        rotations.slice(1).forEach((rotation) => {
          setTimeout(() => {
            setRotationState((current) => ({
              face: rotation.face,
              xRotation:
                current.xRotation + (rotation.axis === "X-axis" ? 90 : 0),
              yRotation:
                current.yRotation + (rotation.axis === "Y-axis" ? 90 : 0),
            }))
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
  }, [dof, rotationAxis])

  useEffect(() => {
    chooseRotationAxis()
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setIsRotating(true)
      chooseRotationAxis()
      rotateCube()
      setTimeout(() => setIsRotating(false), 500)
    }, duration)
    return (): void => clearInterval(interval)
  }, [chooseRotationAxis, rotateCube])

  return {
    rotationAxis,
    rotationState,
    isRotating,
    setIsRotating,
    rotateCube,
  }
}
