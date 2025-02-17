import { useCallback, useEffect, useState } from "react"
import { Range as ValidNumbers } from "some-types-utils"

type RotationAxis = "X-axis" | "Y-axis"
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
      const smoothXRotation = getSmoothRotation(newXRotation, targetRotation.x)
      const smoothYRotation = getSmoothRotation(newYRotation, targetRotation.y)

      return {
        face: newFace,
        xRotation: smoothXRotation,
        yRotation: smoothYRotation,
      }
    })
  }, [rotationAxis])

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
