/**
 *  * This file includes an emoji sourced from Reshot.
 *   * Licensed under the Reshot Free License.
 *    * For more details, visit: https://www.reshot.com/license/
 *     */

import type { FC } from "react"
import { motion } from "framer-motion"

type BoredEmojiProps = {
  isSleeping: boolean
}

const BoredEmoji: FC<BoredEmojiProps> = ({ isSleeping }) => {
  return (
    <motion.div
      animate={isSleeping ? { rotate: [-2, 2, -2] } : { rotate: 0 }}
      transition={{
        repeat: isSleeping ? Infinity : 0,
        duration: 2,
        ease: "easeInOut",
      }}
      className="size-[200px]"
    >
      {isSleeping ? (
        // Sleeping emoji
        <motion.svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="23" fill="#ffce52" />
          <path
            d="M24 4c12.15 0 22 8.507 22 19h.975a23 23 0 0 0-45.95 0H2C2 12.507 11.85 4 24 4z"
            fill="#ffe369"
          />
          <path
            d="M46 23c0 10.493-9.85 19-22 19S2 33.493 2 23h-.975c-.014.332-.025.665-.025 1a23 23 0 0 0 46 0c0-.335-.011-.668-.025-1z"
            fill="#ffb32b"
          />
          <ellipse
            fill="#f6fafd"
            cx="37"
            cy="8"
            rx=".825"
            ry="1.148"
            transform="rotate(-45.02 37 8)"
          />
          <ellipse
            fill="#f6fafd"
            cx="30.746"
            cy="3.5"
            rx=".413"
            ry=".574"
            transform="rotate(-45.02 30.746 3.5)"
          />
          <ellipse
            fill="#f6fafd"
            cx="34"
            cy="6"
            rx="1.65"
            ry="2.297"
            transform="rotate(-45.02 34 6)"
          />
          <ellipse fill="#273941" cx="24" cy="31" rx="4" ry="5" />
          <path
            d="M24 27c2.072 0 3.756 1.977 3.96 4.5.013-.167.04-.329.04-.5 0-2.761-1.791-5-4-5s-4 2.239-4 5c0 .171.027.333.04.5.204-2.523 1.888-4.5 3.96-4.5z"
            fill="#141e21"
          />
          <path
            d="M24 36a4.024 4.024 0 0 0 3.579-2.808 5.969 5.969 0 0 0-7.158 0A4.024 4.024 0 0 0 24 36z"
            fill="#ae2d4c"
          />
          <path
            d="M24 35a3.789 3.789 0 0 1-3.2-2.047c-.125.08-.258.15-.378.239A4.024 4.024 0 0 0 24 36a4.024 4.024 0 0 0 3.579-2.808c-.12-.089-.253-.159-.378-.239A3.789 3.789 0 0 1 24 35z"
            fill="#8a293d"
          />
          <path
            fill="#273941"
            d="M14 23a5.006 5.006 0 0 1-5-5h2a3 3 0 0 0 6 0h2a5.006 5.006 0 0 1-5 5zM34 23a5.006 5.006 0 0 1-5-5h2a3 3 0 0 0 6 0h2a5.006 5.006 0 0 1-5 5z"
          />
          <motion.g
            animate={{
              opacity: [0, 1, 0],
              y: [-2, -4, -6],
              x: [0, 2, 4],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "linear",
            }}
          >
            <path
              fill="#048ec6"
              d="M48 8h-7a1 1 0 0 1-.707-1.707L44.586 2H41V0h6a1 1 0 0 1 .707 1.707L43.414 6H48z"
            />
            <path
              fill="#048ec6"
              d="M36 15h-6a1 1 0 0 1-.707-1.707L33.586 9H30V7h6a1 1 0 0 1 .707 1.707L32.414 13H36z"
            />
            <path
              fill="#048ec6"
              d="M26 11h-4a1 1 0 0 1-.707-1.707L23.586 7H22V5h4a1 1 0 0 1 .707 1.707L24.414 9H26z"
            />
          </motion.g>
        </motion.svg>
      ) : (
        // Studying emoji
        <motion.svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="23" fill="#ffb32b" />
          <motion.g
            animate={{
              y: [-0.5, 0.5, -0.5],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <ellipse fill="#273941" cx="28" cy="25" rx="3" ry="4" />
            <ellipse fill="#273941" cx="10" cy="25" rx="3" ry="4" />
            <ellipse fill="#141e21" cx="28" cy="25" rx="2" ry="3" />
            <ellipse fill="#141e21" cx="10" cy="25" rx="2" ry="3" />
            <circle fill="#f6fafd" cx="29" cy="24" r="1" />
            <circle fill="#f6fafd" cx="11" cy="24" r="1" />
            <path
              fill="#273941"
              d="M23 38h-2c0-.408-.779-1-2-1s-2 .592-2 1h-2c0-1.683 1.757-3 4-3s4 1.317 4 3z"
            />
          </motion.g>
          <path
            d="M24 1a23 23 0 1 0 23 23A23 23 0 0 0 24 1zm-2 45a19 19 0 1 1 19-19 19 19 0 0 1-19 19z"
            fill="#ffce52"
          />
          <path
            d="M47 24A23 23 0 0 0 6.307 9.307a23 23 0 0 1 32.386 32.386A22.95 22.95 0 0 0 47 24z"
            fill="#ffe369"
          />
          <ellipse
            fill="#f6fafd"
            cx="43"
            cy="26"
            rx=".825"
            ry="1.148"
            transform="rotate(-45.02 43 26)"
          />
          <ellipse
            fill="#f6fafd"
            cx="43.746"
            cy="19.5"
            rx=".413"
            ry=".574"
            transform="rotate(-45.02 43.746 19.5)"
          />
          <ellipse
            fill="#f6fafd"
            cx="43"
            cy="22"
            rx="1.65"
            ry="2.297"
            transform="rotate(-45.02 43 22)"
          />
          <motion.path
            d="M47 8c0-3.866-4.029-7-9-7s-9 3.134-9 7c0 3.635 3.442 6.656 8 7v4l6.423-5.423A6.619 6.619 0 0 0 47 8z"
            fill="#5987dd"
          />
          <path
            d="M47 8c0-3.866-4.029-7-9-7a9.549 9.549 0 0 0-7.989 3.785A10.523 10.523 0 0 1 36 3c4.971 0 9 3.134 9 7a5.743 5.743 0 0 1-1 3.194A6.418 6.418 0 0 0 47 8z"
            fill="#95b4ff"
          />
          <path
            d="M37 19v-4c-4.558-.344-8-3.365-8-7a5.766 5.766 0 0 1 1.011-3.215A6.433 6.433 0 0 0 27 10c0 3.635 3.442 6.656 8 7v4l6.423-5.423A7.861 7.861 0 0 0 44 13.194c-.189.132-.378.264-.58.383z"
            fill="#f29410"
          />
          <motion.g
            animate={{
              scale: [1, 1.1, 1],
              opacity: [1, 0.7, 1],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              repeatType: "reverse",
              staggerChildren: 0.2,
            }}
          >
            <circle fill="#ededed" cx="34" cy="8" r="1" />
            <circle fill="#ededed" cx="38" cy="8" r="1" />
          </motion.g>
        </motion.svg>
      )}
    </motion.div>
  )
}

export default BoredEmoji
