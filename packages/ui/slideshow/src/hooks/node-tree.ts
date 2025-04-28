import { useEffect, useMemo, useState } from "react"
import { calculatePoints } from "@slideshow/utils/node-tree"

export const useLadderTree = (elements, params) => {
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth * 0.8,
        height: window.innerHeight * 0.8,
      })
    }

    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const points = useMemo(() => {
    // North-South Orientation: Swapped initialX and initialY
    return calculatePoints(elements, {
      ...params,
      initialX: dimensions.width * 0.5, // Center horizontally
      initialY: dimensions.height * 0.1, // Start from top
    })
  }, [elements, params, dimensions])

  const svgBounds = useMemo(() => {
    if (points.length === 0) return { minX: 0, maxX: 100, minY: 0, maxY: 100 }

    const xValues = points.map((p) => p.x)
    const yValues = points.map((p) => p.y)

    return {
      minX: Math.min(...xValues) - params.w,
      maxX: Math.max(...xValues) + params.w,
      minY: Math.min(...yValues) - params.l, // Adjusted for North-South
      maxY: Math.max(...yValues) + params.w,
    }
  }, [points, params.w, params.l]) // Added params.l

  return { points, svgBounds, dimensions }
}

export const useAnimatedNodes = (totalNodes) => {
  const [visibleCount, setVisibleCount] = useState(1)
  const [animationSpeed, setAnimationSpeed] = useState(800)
  const [animating, setAnimating] = useState(false)

  useEffect(() => {
    setVisibleCount(1)
  }, [totalNodes])

  // Function to start the animation
  const startAnimation = () => {
    if (visibleCount < totalNodes && !animating) {
      setAnimating(true)
      let current = visibleCount

      const interval = setInterval(() => {
        current += 1
        setVisibleCount(current)

        if (current >= totalNodes) {
          clearInterval(interval)
          setAnimating(false)
        }
      }, animationSpeed)

      return () => clearInterval(interval)
    }
  }

  // Function to reset the animation
  const resetAnimation = () => {
    setVisibleCount(1)
  }

  return {
    animationSpeed,
    visibleCount,
    startAnimation,
    resetAnimation,
    animating,
  }
}
