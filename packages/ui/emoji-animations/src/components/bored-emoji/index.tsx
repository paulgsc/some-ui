import type { FC } from "react"
import { motion } from "framer-motion"

type BoredEmojiProps = {
  isSleeping: boolean
}

const BoredEmoji: FC<BoredEmojiProps> = ({ isSleeping }) => {
  return (
    <motion.svg
      width="100"
      height="100"
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      animate={
        isSleeping
          ? { scale: [1, 0.95, 1], rotate: [-2, 2, -2] }
          : { scale: 1, rotate: 0 }
      }
      transition={{
        repeat: isSleeping ? Infinity : 0,
        duration: 2,
        ease: "easeInOut",
      }}
    >
      {/* Base shape - egg-like when awake, more circular when sleeping */}
      <motion.path
        d={
          isSleeping
            ? "M50 95C74.8528 95 95 74.8528 95 50C95 25.1472 74.8528 5 50 5C25.1472 5 5 25.1472 5 50C5 74.8528 25.1472 95 50 95Z"
            : "M50 95C74.8528 95 95 74.8528 95 50C95 25.1472 74.8528 5 50 5C25.1472 5 5 25.1472 5 50C5 82.8528 25.1472 95 50 95Z"
        }
        fill="#FFD700"
      />
      {isSleeping ? (
        // Sleeping face
        <>
          {/* Closed eyes */}
          <path
            d="M30 45 C35 45, 40 45, 45 45"
            stroke="black"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M55 45 C60 45, 65 45, 70 45"
            stroke="black"
            strokeWidth="3"
            strokeLinecap="round"
          />
          {/* Small round mouth */}
          <circle cx="50" cy="65" r="5" fill="black" />
          {/* Sleeping Z's */}
          <motion.g
            initial={{ opacity: 0, x: -5, y: -5 }}
            animate={{ opacity: [0, 1, 0], x: [-5, 0, 5], y: [-5, -10, -15] }}
            transition={{ duration: 2, repeat: Infinity, repeatType: "loop" }}
          >
            <text x="75" y="25" fontSize="16" fill="black" fontWeight="bold">
              z
            </text>
            <text x="82" y="20" fontSize="14" fill="black" fontWeight="bold">
              z
            </text>
            <text x="88" y="15" fontSize="12" fill="black" fontWeight="bold">
              z
            </text>
          </motion.g>
        </>
      ) : (
        <path
          d="M35 55 Q50 70 65 55"
          stroke="black"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      )}
    </motion.svg>
  )
}

export default BoredEmoji
