import { useEffect, useRef, useState } from "react"

type Channel = {
  id: number
  name: string
  description: string
  imageUrl: string
}

export const TVStaticAnimation = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isStatic, setIsStatic] = useState(true)
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null)
  const animationRef = useRef<number | null>(null)
  const [shuffledChannels, setShuffledChannels] = useState<Array<Channel>>([])

  const channels: Array<Channel> = [
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

  // Fisher-Yates shuffle algorithm
  const shuffleArray = (array: Array<Channel>) => {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  // Draw TV static noise on canvas
  const drawStatic = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas dimensions to match its display size
    const { width, height } = canvas.getBoundingClientRect()
    canvas.width = width
    canvas.height = height

    // Draw random static pixels
    const imageData = ctx.createImageData(width, height)
    const data = imageData.data

    for (let i = 0; i < data.length; i += 4) {
      const intensity = Math.floor(Math.random() * 255)
      data[i] = intensity // Red
      data[i + 1] = intensity // Green
      data[i + 2] = intensity // Blue
      data[i + 3] = 255 // Alpha (fully opaque)
    }

    ctx.putImageData(imageData, 0, 0)

    // Continue animation loop
    if (isStatic) {
      animationRef.current = requestAnimationFrame(drawStatic)
    }
  }

  // TV channel search loop
  useEffect(() => {
    let searchTimer: NodeJS.Timeout
    let displayTimer: NodeJS.Timeout

    const startSearchLoop = () => {
      // Show static for 3 seconds
      setIsStatic(true)
      setCurrentChannel(null)

      searchTimer = setTimeout(() => {
        // Stop static animation
        setIsStatic(false)
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current)
        }

        // Show a random channel from shuffled channels
        if (shuffledChannels.length > 0) {
          const randomIndex = Math.floor(
            Math.random() * shuffledChannels.length
          )
          setCurrentChannel(shuffledChannels[randomIndex])
        }

        displayTimer = setTimeout(() => {
          startSearchLoop() // Restart the loop
        }, 4000)
      }, 3000)
    }

    startSearchLoop()

    return () => {
      clearTimeout(searchTimer)
      clearTimeout(displayTimer)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [shuffledChannels])

  // Start or stop static animation based on isStatic state
  useEffect(() => {
    if (isStatic) {
      drawStatic()
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isStatic])

  // Shuffle channels on component mount
  useEffect(() => {
    setShuffledChannels(shuffleArray(channels))
  }, [])

  return (
    <div className="mx-auto size-full">
      <div className="relative aspect-video size-full overflow-hidden rounded-lg border-8 border-gray-800 bg-black shadow-xl">
        {/* TV Screen */}
        <div className="absolute inset-0 bg-black">
          {/* Static Noise */}
          {isStatic && (
            <canvas
              ref={canvasRef}
              className="size-full"
              aria-label="TV static noise"
            />
          )}

          {/* Channel Content */}
          {!isStatic && currentChannel && (
            <div className="flex size-full flex-col">
              <img
                src={currentChannel.imageUrl || "/placeholder.svg"}
                alt={`${currentChannel.name} thumbnail`}
                className="size-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-black bg-opacity-70 p-3 text-white">
                <h3 className="text-xl font-bold">{currentChannel.name}</h3>
                <p className="text-sm opacity-80">
                  {currentChannel.description}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* TV Controls Indicator */}
        <div className="absolute bottom-2 right-2 flex gap-1">
          <div className="size-2 rounded-full bg-red-500"></div>
          <div className="size-2 rounded-full bg-green-500"></div>
        </div>
      </div>
    </div>
  )
}
