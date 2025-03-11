import { useEffect, useRef, useState } from "react"

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

export function useRubberBandAnimation({
  text,
  overlap,
  animationSpeed = 1,
  dampingFactor = 0.9,
}: Options): ReturnOptions {
  const animationRef = useRef<number | null>(null)
  const charPositionsRef = useRef<Array<CharPosition>>([])
  const isAnimatingRef = useRef<boolean>(false)
  const [animationFrame, setAnimationFrame] = useState<number>(0)

  const physicsParams: PhysicsParams = {
    springConstant: 0.2,
    dampingFactor,
    animationSpeed,
  }

  useEffect(() => {
    resetCharPositions()
  }, [text, overlap])

  useEffect(() => {
    return (): void => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  const calculateBasePosition = (index: number): number => {
    return index * (100 - overlap * 60)
  }

  const resetCharPositions = (): void => {
    charPositionsRef.current = text.split(" ").map((_, index) => ({
      x: calculateBasePosition(index),
      velocity: 0,
      amplitude: 0,
    }))
  }

  const calculateSpringForce = (currentX: number, baseX: number): number => {
    return -physicsParams.springConstant * (currentX - baseX)
  }

  const updateVelocity = (velocity: number, force: number): number => {
    const newVelocity = velocity + force
    return newVelocity * physicsParams.dampingFactor
  }

  /**
   * Initialize random amplitude and velocity for animation
   */
  const initializeRandomMotion = (): Array<CharPosition> => {
    return charPositionsRef.current.map((char) => ({
      ...char,
      amplitude: Math.random() * 20 - 10,
      velocity: (Math.random() * 10 - 5) * physicsParams.animationSpeed,
    }))
  }

  const triggerAnimation = (): void => {
    if (isAnimatingRef.current) return

    resetCharPositions()
    charPositionsRef.current = initializeRandomMotion()
    isAnimatingRef.current = true
    animateRubberBand()
  }

  const animateRubberBand = (): void => {
    charPositionsRef.current = charPositionsRef.current.map((char, index) => {
      const baseX = calculateBasePosition(index)
      const springForce = calculateSpringForce(char.x, baseX)
      const newVelocity = updateVelocity(char.velocity, springForce)
      const newX = char.x + newVelocity

      return {
        x: newX,
        velocity: newVelocity,
        amplitude: char.amplitude * physicsParams.dampingFactor,
      }
    })

    setAnimationFrame((prev) => prev + 1)

    animationRef.current = requestAnimationFrame(animateRubberBand)
  }

  return {
    charPositions: charPositionsRef.current,
    triggerAnimation,
    animationFrame,
    isAnimating: isAnimatingRef.current,
    resetCharPositions,
  }
}
