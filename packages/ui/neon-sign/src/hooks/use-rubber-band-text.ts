import { useCallback, useEffect, useRef, useState } from "react"

type CharPosition = {
  x: number
  velocity: number
  amplitude: number
}

type PhysicsParams = {
  springConstant: number
  dampingFactor: number
  animationSpeed: number
}

type Options = {
  text: string
  overlap: number
  animationSpeed?: number
  dampingFactor?: number
}

type ReturnOptions = {
  charPositions: Array<CharPosition>
  triggerAnimation: () => void
  animationFrame: number
  isAnimating: boolean
  resetCharPositions: () => void
}

// 1. Pure state generator isolated from render lifecycle
function buildCharPositions(
  text: string,
  overlap: number
): Array<CharPosition> {
  return text.split(" ").map((_, index) => ({
    x: index * (100 - overlap * 60),
    velocity: 0,
    amplitude: 0,
  }))
}

export function useRubberBandAnimation({
  text,
  overlap,
  animationSpeed = 1,
  dampingFactor = 0.9,
}: Options): ReturnOptions {
  // React state for rendering (Snapshot layer)
  const [charPositions, setCharPositions] = useState<Array<CharPosition>>(() =>
    buildCharPositions(text, overlap)
  )
  const [isAnimating, setIsAnimating] = useState<boolean>(false)
  const [animationFrame, setAnimationFrame] = useState<number>(0)

  // Mutable refs for physics simulation (Safe to access in effects/callbacks)
  const simulationRef = useRef({
    chars: buildCharPositions(text, overlap),
  })

  // Track props in refs to avoid stale closures inside the effect loop
  const textRef = useRef(text)
  const overlapRef = useRef(overlap)
  const physicsParams = useRef<PhysicsParams>({
    springConstant: 0.2,
    dampingFactor,
    animationSpeed,
  })

  useEffect(() => {
    textRef.current = text
  }, [text])

  useEffect(() => {
    overlapRef.current = overlap
  }, [overlap])

  useEffect(() => {
    physicsParams.current = {
      springConstant: 0.2,
      dampingFactor,
      animationSpeed,
    }
  }, [dampingFactor, animationSpeed])

  // Physics loop cleanly managed by an Effect listening to state
  useEffect(() => {
    if (!isAnimating) return

    let frameId: number

    const loop = (): void => {
      const currentOverlap = overlapRef.current
      const params = physicsParams.current

      simulationRef.current.chars = simulationRef.current.chars.map(
        (char, index) => {
          const baseX = index * (100 - currentOverlap * 60)
          const springForce = -params.springConstant * (char.x - baseX)
          const velocity = (char.velocity + springForce) * params.dampingFactor

          return {
            x: char.x + velocity,
            velocity,
            amplitude: char.amplitude * params.dampingFactor,
          }
        }
      )

      // Commit snapshot to React render engine state
      setCharPositions([...simulationRef.current.chars])
      setAnimationFrame((frame) => frame + 1)

      frameId = requestAnimationFrame(loop)
    }

    frameId = requestAnimationFrame(loop)

    return (): void => cancelAnimationFrame(frameId)
  }, [isAnimating])

  const triggerAnimation = useCallback((): void => {
    if (isAnimating) return

    const params = physicsParams.current

    // Initialize physics state for the bounce
    simulationRef.current.chars = simulationRef.current.chars.map((char) => ({
      ...char,
      amplitude: Math.random() * 20 - 10,
      velocity: (Math.random() * 10 - 5) * params.animationSpeed,
    }))

    // This triggers the useEffect loop above
    setIsAnimating(true)
  }, [isAnimating])

  const resetCharPositions = useCallback((): void => {
    // This immediately stops the animation by forcing the effect cleanup
    setIsAnimating(false)

    const resetPositions = buildCharPositions(
      textRef.current,
      overlapRef.current
    )
    simulationRef.current.chars = resetPositions

    setCharPositions(resetPositions)
  }, [])

  return {
    charPositions,
    triggerAnimation,
    animationFrame,
    isAnimating,
    resetCharPositions,
  }
}
