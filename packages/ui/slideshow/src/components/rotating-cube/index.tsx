import { useEffect, useState } from "react"
import { Button } from "some-ui-shared"
import { cn } from "some-ui-utils"

import styles from "./index.module.css"

const messages = [
  "Welcome to our 3D cube!",
  "Explore our amazing features",
  "Discover new possibilities",
  "Unleash your creativity",
  "Join our community today",
  "Experience the future",
]

const RotatingCube = () => {
  const [isRotating, setIsRotating] = useState(false)
  const [currentFace, setCurrentFace] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setIsRotating(!isRotating)
      setCurrentFace((prevFace) => (prevFace + 1) % 4)
    }, 10000) // Change face every 3 seconds
    return () => clearInterval(interval)
  }, [])

  const toggleRotation = () => setIsRotating(!isRotating)

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-gray-600">
      <div className="perspective-1000 size-72">
        <div
          className={cn(
            "preserve-3d relative size-full transition-transform duration-500",
            { [styles.rotating]: true }
          )}
          style={{ transform: `rotateY(-${currentFace * 90}deg)` }}
          onMouseEnter={() => setIsRotating(false)}
          onMouseLeave={() => setIsRotating(true)}
        >
          {messages.slice(0, 4).map((message, index) => (
            <div
              key={index}
              className={cn(
                " absolute flex size-full items-center justify-center bg-teal-400",
                {
                  "[transform:rotateY(0deg)_translateZ(150px)]": index === 0,
                  "[transform:rotateY(90deg)_translateZ(150px)]": index === 1,
                  "[transform:rotateY(180deg)_translateZ(150px)]": index === 2,
                  "[transform:rotateY(-90deg)_translateZ(150px)]": index === 3,
                  "opacity-80": isRotating,
                }
              )}
            >
              <p className="p-4 text-center text-xl font-bold text-white">
                {message}
              </p>
            </div>
          ))}
        </div>
      </div>
      <Button onClick={toggleRotation} className="mt-8">
        {isRotating ? "Pause Rotation" : "Resume Rotation"}
      </Button>
    </div>
  )
}

export default RotatingCube
