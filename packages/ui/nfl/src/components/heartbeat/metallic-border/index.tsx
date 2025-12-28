import { Screw } from "@nfl/components/heartbeat/screw"

export const MetallicBorder = () => {
  return (
    <g>
      {/* Metallic ring */}
      <defs>
        <linearGradient id="metalGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c0c0c0" />
          <stop offset="50%" stopColor="#f0f0f0" />
          <stop offset="100%" stopColor="#a0a0a0" />
        </linearGradient>
        <radialGradient
          id="redGradient"
          cx="50%"
          cy="50%"
          r="50%"
          fx="50%"
          fy="50%"
        >
          <stop offset="0%" stopColor="#ff6b6b" />
          <stop offset="70%" stopColor="#e53e3e" />
          <stop offset="100%" stopColor="#c53030" />
        </radialGradient>
        <radialGradient id="outerGlowGradient">
          <stop offset="0%" stopColor="rgba(255,0,0,0.5)" />
          <stop offset="100%" stopColor="rgba(255,0,0,0)" />
        </radialGradient>
      </defs>

      {/* Outer metallic ring */}
      <circle
        cx="110"
        cy="110"
        r="107"
        fill="url(#metalGradient)"
        stroke="#888"
        strokeWidth="1"
      />
      <circle
        cx="110"
        cy="110"
        r="95"
        fill="url(#redGradient)"
        stroke="#730000"
        strokeWidth="2"
      />

      {/* Screws */}
      <Screw />
      <Screw />
      <Screw />
      <Screw />
      <Screw />
      <Screw />
      <Screw />
      <Screw />
    </g>
  )
}
