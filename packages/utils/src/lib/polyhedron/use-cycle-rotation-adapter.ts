import { useEffect, useRef, useState } from "react"
import type { WasmCycleName } from "@some-ui/types"

type Rotation = {
  xRotation: number
  yRotation: number
}

export function useCycleRotationAdapter({
  cyclePosition,
  cycleLength,
  axis = "cube:y",
}: {
  cyclePosition: number
  cycleLength: number
  axis?: WasmCycleName
}): Rotation {
  const prevAngleRef = useRef(0)
  const [angle, setAngle] = useState(0)

  useEffect(() => {
    if (cycleLength === 0) return

    const degreesPerStep = 360 / cycleLength
    const rawTarget = cyclePosition * degreesPerStep

    let delta = rawTarget - prevAngleRef.current

    // 🔑 shortest-path normalization
    if (delta > 180) delta -= 360
    if (delta < -180) delta += 360

    const nextAngle = prevAngleRef.current + delta

    prevAngleRef.current = nextAngle
    setAngle(nextAngle)
  }, [cyclePosition, cycleLength])

  return axis === "cube:x"
    ? { xRotation: angle, yRotation: 0 }
    : { xRotation: 0, yRotation: angle }
}
