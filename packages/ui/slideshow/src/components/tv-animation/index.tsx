import type { JSX } from "react"
import { useCallback, useEffect, useRef, useState } from "react"

type Channel = {
  id: number
  name: string
  description: string
  imageUrl: string
}

const CHANNELS: Array<Channel> = [
  {
    id: 1,
    name: "Code With Me",
    description: "Live coding session: Building a React dashboard",
    imageUrl: "/placeholder.svg?height=200&width=320",
  },
  {
    id: 2,
    name: "Algorithm Arena",
    description: "Solving competitive programming challenges live",
    imageUrl: "/placeholder.svg?height=200&width=320",
  },
  {
    id: 3,
    name: "Web Dev Daily",
    description: "Frontend frameworks comparison & live coding",
    imageUrl: "/placeholder.svg?height=200&width=320",
  },
  {
    id: 4,
    name: "Backend Bytes",
    description: "Building scalable APIs with Node.js and Express",
    imageUrl: "/placeholder.svg?height=200&width=320",
  },
  {
    id: 5,
    name: "DevOps Decoded",
    description: "Live Docker and Kubernetes deployment walkthrough",
    imageUrl: "/placeholder.svg?height=200&width=320",
  },
  {
    id: 6,
    name: "Fullstack Friday",
    description: "Building a complete MERN stack application from scratch",
    imageUrl: "/placeholder.svg?height=200&width=320",
  },
]

function shuffle<T>(array: ReadonlyArray<T>): Array<T> {
  const copy = [...array]

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))

    const a = copy[i]
    const b = copy[j]

    if (a !== undefined && b !== undefined) {
      copy[i] = b
      copy[j] = a
    }
  }

  return copy
}

export const TVStaticAnimation = (): JSX.Element => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationRef = useRef<number | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const displayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isStatic, setIsStatic] = useState<boolean>(true)
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null)

  const drawStatic = useCallback((): void => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const width = Math.floor(rect.width)
    const height = Math.floor(rect.height)

    if (width === 0 || height === 0) return

    canvas.width = width
    canvas.height = height

    const imageData = ctx.createImageData(width, height)
    const { data } = imageData

    for (let i = 0; i < data.length; i += 4) {
      const intensity = Math.floor(Math.random() * 255)
      data[i] = intensity
      data[i + 1] = intensity
      data[i + 2] = intensity
      data[i + 3] = 255
    }

    ctx.putImageData(imageData, 0, 0)

    animationRef.current = requestAnimationFrame(drawStatic)
  }, [])

  const stopAnimation = useCallback((): void => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
  }, [])

  const clearTimers = useCallback((): void => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
      searchTimerRef.current = null
    }
    if (displayTimerRef.current) {
      clearTimeout(displayTimerRef.current)
      displayTimerRef.current = null
    }
  }, [])

  const startLoop = useCallback((): void => {
    setIsStatic(true)
    setCurrentChannel(null)

    searchTimerRef.current = setTimeout((): void => {
      setIsStatic(false)
      stopAnimation()

      const shuffled = shuffle(CHANNELS)
      const next = shuffled[0] ?? null
      setCurrentChannel(next)

      displayTimerRef.current = setTimeout((): void => {
        startLoop()
      }, 4000)
    }, 3000)
  }, [stopAnimation])

  useEffect((): (() => void) => {
    startLoop()

    return (): void => {
      clearTimers()
      stopAnimation()
    }
  }, [startLoop, clearTimers, stopAnimation])

  useEffect((): (() => void) => {
    if (isStatic) {
      drawStatic()
    } else {
      stopAnimation()
    }

    return (): void => {
      stopAnimation()
    }
  }, [isStatic, drawStatic, stopAnimation])

  return (
    <div className="mx-auto size-full">
      <div className="relative aspect-video size-full overflow-hidden rounded-lg border-8 border-gray-800 bg-black shadow-xl">
        <div className="absolute inset-0 bg-black">
          {isStatic && (
            <canvas
              ref={canvasRef}
              className="size-full"
              aria-label="TV static noise"
            />
          )}

          {!isStatic && currentChannel && (
            <div className="flex size-full flex-col">
              <img
                src={currentChannel.imageUrl}
                alt={`${currentChannel.name} thumbnail`}
                className="size-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-black/70 p-3 text-white">
                <h3 className="text-xl font-bold">{currentChannel.name}</h3>
                <p className="text-sm opacity-80">
                  {currentChannel.description}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="absolute bottom-2 right-2 flex gap-1">
          <div className="size-2 rounded-full bg-red-500" />
          <div className="size-2 rounded-full bg-green-500" />
        </div>
      </div>
    </div>
  )
}
