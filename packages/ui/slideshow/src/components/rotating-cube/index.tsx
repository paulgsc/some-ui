import { useEffect, useState } from "react"
import { Button } from "some-ui-shared"

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
  const [isRotating, setIsRotating] = useState(true)
  const [currentFace, setCurrentFace] = useState(0)

  useEffect(() => {
    if (isRotating) {
      const interval = setInterval(() => {
        setCurrentFace((prevFace) => (prevFace + 1) % 4)
      }, 3000) // Change face every 3 seconds
      return () => clearInterval(interval)
    }
  }, [isRotating])

  const toggleRotation = () => setIsRotating(!isRotating)

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-gray-600">
      <div className={styles.scene}>
        <div
          className={`${styles.cube} ${isRotating ? styles.rotating : ""}`}
          style={{ transform: `rotateY(-${currentFace * 90}deg)` }}
          onMouseEnter={() => setIsRotating(false)}
          onMouseLeave={() => setIsRotating(true)}
        >
          {messages.slice(0, 4).map((message, index) => (
            <div
              key={index}
              className={`${styles.cube__face} ${styles[`cube__face--${index}`]}`}
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
