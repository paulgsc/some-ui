type NFLJerseyProps = {
  number: string
  name: string
  primaryColor?: string
  secondaryColor?: string
  textColor?: string
  centerX?: number
  centerY?: number
  scale: number
}

const NINER_PRIMARY_COLOR = "#AA0000" // 49ers Red
const NINER_SECONDARY_COLOR = "#B3995D" // 49ers Gold
const NINER_TEXT_COLOR = "#FFFFFF" // White

export const NFLJersey = ({
  scale,
  number = "12",
  name = "BRADY",
  primaryColor = NINER_PRIMARY_COLOR, // Giants blue as default
  secondaryColor = NINER_SECONDARY_COLOR, // Giants red as default
  textColor = NINER_TEXT_COLOR,
  centerX = 0,
  centerY = 0,
}: NFLJerseyProps): React.JSX.Element => {
  return (
    <g
      transform={`translate(${centerX}, ${centerY}) scale(${scale}) translate(-150, -175)`}
    >
      {/* Jersey Base */}
      <path
        d="M150 20 L240 50 L260 100 L260 330 L40 330 L40 100 L60 50 Z"
        fill={primaryColor}
        stroke="#000000"
        strokeWidth="2"
      />

      {/* Collar */}
      <path
        d="M110 20 L150 40 L190 20 L190 30 L150 50 L110 30 Z"
        fill={secondaryColor}
        stroke="#000000"
        strokeWidth="1.5"
      />

      {/* Left Sleeve Stripe */}
      <path
        d="M40 120 L70 120 L70 140 L40 140 Z"
        fill={secondaryColor}
        stroke="#000000"
        strokeWidth="1"
      />

      {/* Right Sleeve Stripe */}
      <path
        d="M230 120 L260 120 L260 140 L230 140 Z"
        fill={secondaryColor}
        stroke="#000000"
        strokeWidth="1"
      />

      {/* Shoulder Pads */}
      <path
        d="M60 50 L110 30 L110 50 L60 70 Z"
        fill={primaryColor}
        stroke="#000000"
        strokeWidth="1.5"
      />
      <path
        d="M240 50 L190 30 L190 50 L240 70 Z"
        fill={primaryColor}
        stroke="#000000"
        strokeWidth="1.5"
      />

      {/* Seam Lines */}
      <line
        x1="150"
        y1="50"
        x2="150"
        y2="330"
        stroke="#000000"
        strokeWidth="1"
        strokeDasharray="5,5"
      />

      {/* Bottom Trim */}
      <path
        d="M40 310 L260 310 L260 330 L40 330 Z"
        fill={secondaryColor}
        stroke="#000000"
        strokeWidth="1"
      />

      {/* Number */}
      <text
        x="150"
        y="180"
        fontFamily="Arial, sans-serif"
        fontSize="120"
        fontWeight="bold"
        fill={textColor}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{
          filter: "drop-shadow(2px 2px 0px rgba(0,0,0,0.3))",
        }}
      >
        {number}
      </text>

      {/* Name on Back (if space allows) */}
      {name && (
        <text
          x="150"
          y="80"
          fontFamily="Arial, sans-serif"
          fontSize="24"
          fontWeight="bold"
          fill={textColor}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {name.toUpperCase()}
        </text>
      )}
    </g>
  )
}
