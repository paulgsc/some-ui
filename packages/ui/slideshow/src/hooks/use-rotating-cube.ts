import { useCallback, useEffect, useState } from "react"
import { Range as ValidNumbers } from "some-types-utils"

type RotationAxis = "X-axis" | "Y-axis"
type Rotation = {
  axis: RotationAxis
  face: Face
}
type AllowedRotationAxis = RotationAxis | "All"
type Options = {
  dof?: AllowedRotationAxis
}
type ReturnOptions = {
  isRotating: boolean
  rotationAxis: RotationAxis
  setIsRotating: (arg: boolean) => void
  rotationState: RotationState
  rotateCube: () => void
}

type Face = ValidNumbers<6>
type RotationState = {
  face: Face
  xRotation: number
  yRotation: number
}

const FACE_Adj_List: Record<Face, Record<"x" | "y", number>> = {
  0: { x: 0, y: 0 },
  1: { x: 0, y: 90 },
  2: { x: 0, y: 180 },
  3: { x: 0, y: 270 },
  4: { x: 90, y: 0 },
  5: { x: -90, y: 0 },
}

// Define adjacency map for each face
const FACE_GRAPH: Record<Face, Record<RotationAxis, Face>> = {
  0: { "X-axis": 4, "Y-axis": 1 }, // Front -> Top/Right
  1: { "X-axis": 4, "Y-axis": 2 }, // Right -> Top/Back
  2: { "X-axis": 4, "Y-axis": 3 }, // Back -> Top/Left
  3: { "X-axis": 4, "Y-axis": 0 }, // Left -> Top/Front
  4: { "X-axis": 2, "Y-axis": 1 }, // Top -> Back/Right
  5: { "X-axis": 0, "Y-axis": 1 }, // Bottom -> Front/Right
}

const getRotationPath = (
  startFace: Face,
  targetFace: Face,
  preferredAxis?: RotationAxis
): Rotation[] => {
  if (startFace === targetFace) return []

  // Use BFS to find the shortest path
  const queue: Array<{ face: Face; path: Rotation[] }> = [
    { face: startFace, path: [] },
  ]
  const visited = new Set<Face>([startFace])

  while (queue.length > 0) {
    const { face, path } = queue.shift()!

    // Try preferred axis first if specified
    const axes: RotationAxis[] = preferredAxis
      ? [preferredAxis, preferredAxis === "X-axis" ? "Y-axis" : "X-axis"]
      : ["X-axis", "Y-axis"]

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

export const useRotatingCube = ({ dof = "Y-axis" }: Options): ReturnOptions => {
  const [isRotating, setIsRotating] = useState<boolean>(false)
  const [rotationState, setRotationState] = useState<RotationState>({
    face: 0,
    xRotation: 0,
    yRotation: 0,
  })
  const [rotationAxis, setRotationAxis] = useState<RotationAxis>("Y-axis")

  const chooseRotationAxis = useCallback(
    (dof: AllowedRotationAxis): void => {
      switch (dof) {
        case "Y-axis": {
          break
        }
        case "X-axis": {
          setRotationAxis(dof)
          break
        }
        case "All": {
          const axis = Math.random() < 0.5 ? "X-axis" : "Y-axis"
          setRotationAxis(axis)
          break
        }
        default: {
          dof satisfies never
          return
        }
      }
    },
    [dof]
  )

  const rotateCube = useCallback(() => {
    setRotationState((prev) => {
      if (dof !== "All") {
        const { face, xRotation, yRotation } = prev
        let newFace: Face
        let newXRotation = xRotation
        let newYRotation = yRotation

        console.log("axis is now: ", rotationAxis)
        switch (rotationAxis) {
          case "X-axis": {
            // Cycle through faces: 0 (Front) -> 4 (Top) -> 2 (Back) -> 5 (Bottom) -> 0 (Front)
            newFace = (
              face === 0 ? 4 : face === 4 ? 2 : face === 2 ? 5 : 0
            ) as Face
            newXRotation += 90
            console.log("x-axis ran!")
            break
          }
          case "Y-axis": {
            // Cycle through faces: 0 (Front) -> 1 (Right) -> 2 (Back) -> 3 (Left) -> 0 (Front)
            newFace = ((face + 1) % 4) as Face
            newYRotation += 90
            console.log("y-axis ran!")
            break
          }
          default:
            rotationAxis satisfies never
            throw new Error("Invalid rotation axis")
        }

        newXRotation = newXRotation % 360
        newYRotation = newYRotation % 360

        function getSmoothRotation(curr: number, target: number): number {
          const diff = target - curr
          if (Math.abs(diff) > 180) {
            return curr + (diff > 0 ? -360 : 360) + diff
          }
          return target
        }

        const targetRotation = FACE_Adj_List[newFace]
        const smoothXRotation = getSmoothRotation(
          newXRotation,
          targetRotation.x
        )
        const smoothYRotation = getSmoothRotation(
          newYRotation,
          targetRotation.y
        )

        return {
          face: newFace,
          xRotation: smoothXRotation,
          yRotation: smoothYRotation,
        }
      }

      // For dual-axis rotation, choose random target face and find path
      const possibleFaces: Face[] = [0, 1, 2, 3, 4, 5]
      const targetFace = possibleFaces[Math.floor(Math.random() * 6)] as Face

      const rotations = getRotationPath(prev.face, targetFace)
      if (rotations.length === 0) return prev

      // Apply first rotation in path
      const firstRotation = rotations[0]
      let newXRotation = prev.xRotation
      let newYRotation = prev.yRotation

      if (firstRotation.axis === "X-axis") {
        newXRotation += 90
      } else {
        newYRotation += 90
      }

      // Queue up subsequent rotations with timeouts
      if (rotations.length > 1) {
        let delay = 500 // Match your transition time
        rotations.slice(1).forEach((rotation) => {
          setTimeout(() => {
            setRotationState((current) => {
              const xRot =
                rotation.axis === "X-axis"
                  ? current.xRotation + 90
                  : current.xRotation
              const yRot =
                rotation.axis === "Y-axis"
                  ? current.yRotation + 90
                  : current.yRotation
              return {
                face: rotation.face,
                xRotation: xRot % 360,
                yRotation: yRot % 360,
              }
            })
          }, delay)
          delay += 500
        })
      }

      return {
        face: firstRotation.face,
        xRotation: newXRotation % 360,
        yRotation: newYRotation % 360,
      }
    })
  }, [dof])

  useEffect(() => {
    const interval = setInterval(() => {
      setIsRotating(true)
      chooseRotationAxis(dof)
      rotateCube()
      setTimeout(() => setIsRotating(false), 500) // Assuming 500ms transition
    }, 10000) // Change face every 10 seconds
    return (): void => clearInterval(interval)
  }, [dof, chooseRotationAxis, rotateCube])

  return {
    rotationAxis,
    rotationState,
    isRotating,
    setIsRotating,
    rotateCube,
  }
}
