import type { CSSProperties, FC } from "react"
import { cn } from "@shared/lib/utils"

type AntSvgProps = {
  color?: string
  className?: string
  style?: CSSProperties
}

export const AntSvg: FC<AntSvgProps> = ({
  color = "#333333",
  className,
  style,
}) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ ...style }}
      className={cn("absolute inset-0", className)}
    >
      {/* Head */}
      <circle cx="18" cy="12" r="4" fill={color} />

      {/* Body segments */}
      <circle cx="12" cy="12" r="3.5" fill={color} />
      <circle cx="6" cy="12" r="3" fill={color} />

      {/* Antennae */}
      <path
        d="M21 9C22 8 22.5 6 21.5 5"
        stroke={color}
        strokeWidth="1"
        className="animate-wiggle-1"
        style={{ transformOrigin: "21px 9px" }}
      />
      <path
        d="M21 15C22 16 22.5 18 21.5 19"
        stroke={color}
        strokeWidth="1"
        className="animate-wiggle-2"
        style={{ transformOrigin: "21px 15px" }}
      />

      {/* Legs - top side */}
      <path
        d="M17 8.5C17 7 18 5.5 19 5"
        stroke={color}
        strokeWidth="1"
        className="animate-leg-move"
        style={{ transformOrigin: "17px 8.5px" }}
      />
      <path
        d="M12 8.5C12 7 11 5.5 10 5"
        stroke={color}
        strokeWidth="1"
        className="animate-leg-move-reverse"
        style={{ transformOrigin: "12px 8.5px" }}
      />
      <path
        d="M7 8.5C7 7 6 5.5 5 5"
        stroke={color}
        strokeWidth="1"
        className="animate-leg-move"
        style={{ transformOrigin: "7px 8.5px" }}
      />

      {/* Legs - bottom side */}
      <path
        d="M17 15.5C17 17 18 18.5 19 19"
        stroke={color}
        strokeWidth="1"
        className="animate-leg-move-reverse"
        style={{ transformOrigin: "17px 15.5px" }}
      />
      <path
        d="M12 15.5C12 17 11 18.5 10 19"
        stroke={color}
        strokeWidth="1"
        className="animate-leg-move"
        style={{ transformOrigin: "12px 15.5px" }}
      />
      <path
        d="M7 15.5C7 17 6 18.5 5 19"
        stroke={color}
        strokeWidth="1"
        className="animate-leg-move-reverse"
        style={{ transformOrigin: "7px 15.5px" }}
      />
    </svg>
  )
}
