import { FC } from "react"

interface RainingCharacterProps {
  char: string
  x: number
  y: number
  isActive: boolean
}

export const RainingCharacter: FC<RainingCharacterProps> = ({
  char,
  x,
  y,
  isActive,
}) => {
  return (
    <span
      className={`absolute text-xs transition-colors duration-100 ${
        isActive
          ? "text-[#00ff00] text-base scale-125 z-10 font-bold animate-pulse"
          : "text-slate-600 font-light"
      }`}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -50%) ${isActive ? "scale(1.25)" : "scale(1)"}`,
        textShadow: isActive
          ? "0 0 8px rgba(255,255,255,0.8), 0 0 12px rgba(255,255,255,0.4)"
          : "none",
        opacity: isActive ? 1 : 0.4,
        transition: "color 0.1s, transform 0.1s, text-shadow 0.1s",
        willChange: "transform, top",
        fontSize: "1.8rem",
      }}
    >
      {char}
    </span>
  )
}
