import type { HTMLAttributes, ReactSVGElement, SVGAttributes } from "react"
import { forwardRef, Fragment, type ComponentPropsWithoutRef } from "react"
import { cn } from "some-ui-utils"

type FootballFieldProps = {
  teamName?: string
  primaryColor?: string
  secondaryColor?: string
  accentColor?: string
  fieldColor?: string
  width?: number
  height?: number
} & SVGAttributes<SVGElement>

type CenterLogoProps = {
  teamLogo?: string | ReactSVGElement
  primaryColor?: string
  secondaryColor?: string
  accentColor?: string
  width?: number
  height?: number
} & SVGAttributes<SVGElement>

type EndZoneProps = {
  teamName?: string
  primaryColor?: string
  secondaryColor?: string
  accentColor?: string
  fieldColor?: string
  width?: number
  height?: number
} & SVGAttributes<SVGElement>

type FieldBorderProps = {
  primaryColor?: string
  secondaryColor?: string
  accentColor?: string
  width?: number
  height?: number
} & SVGAttributes<SVGRectElement>

type FieldLineProps = {
  count?: number
  startX?: number
  spacing?: number
  dashArray?: string
} & SVGAttributes<SVGLineElement>

type YardNumberProps = {
  orientation: "top" | "bottom"
  startX?: number
  spacing?: number
  fontSize?: number
} & SVGAttributes<SVGElement>

const FootballFieldRoot = forwardRef<SVGSVGElement, FootballFieldProps>(
  (
    {
      className,
      teamName = "NORTON",
      primaryColor = "#C8102E",
      secondaryColor = "#FFB612",
      accentColor = "white",
      fieldColor = "#2E5A27",
      width = 100,
      height = 53.3,
      ...props
    },
    ref
  ) => {
    return (
      <svg
        ref={ref}
        className={cn("size-full", className)}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <rect width={width} height={height} fill={fieldColor} />
        {props.children}
      </svg>
    )
  }
)
FootballFieldRoot.displayName = "FootballFieldRoot"

const EndZone = forwardRef<SVGRectElement, EndZoneProps>(
  (
    {
      className,
      height = 0,
      accentColor,
      teamName,
      width = 0,
      primaryColor,
      ...props
    },
    ref
  ) => {
    return (
      <g ref={ref} className={cn(className)} {...props}>
        {/* Left endzone */}
        <rect width={10} height={height} fill={primaryColor} />
        <text
          x={5}
          y={height / 2}
          fill={accentColor}
          fontSize={4}
          textAnchor="middle"
          transform={`rotate(-90, 5, ${height / 2})`}
        >
          {teamName}
        </text>

        {/* Right endzone */}
        <rect x={width - 10} width={10} height={height} fill={primaryColor} />
        <text
          x={width - 5}
          y={height / 2}
          fill={accentColor}
          fontSize={4}
          textAnchor="middle"
          transform={`rotate(90, ${width - 5}, ${height / 2})`}
        >
          {teamName}
        </text>
      </g>
    )
  }
)
EndZone.displayName = "EndZone"

const FieldLines = forwardRef<SVGGElement, FieldLineProps>(
  ({ count = 21, startX = 10, spacing = 4, dashArray, ...props }, ref) => {
    return (
      <g ref={ref} {...props}>
        {Array.from({ length: count }).map((_, i) => (
          <line
            key={`line-${i}`}
            x1={startX + i * spacing}
            y1={0}
            x2={startX + i * spacing}
            y2={53.3}
            stroke="white"
            strokeWidth={i % 2 === 0 ? "0.15" : "0.1"}
            strokeDasharray={i % 2 === 0 ? "" : dashArray || "0.2,0.2"}
          />
        ))}
      </g>
    )
  }
)
FieldLines.displayName = "FieldLines"

const HashMarks = forwardRef<SVGGElement, ComponentPropsWithoutRef<"g">>(
  ({ ...props }, ref) => {
    return (
      <g ref={ref} {...props}>
        {Array.from({ length: 100 }).map((_, i) => (
          <Fragment key={`hash-${i}`}>
            <line
              x1={10 + i * 0.8}
              y1={15.3}
              x2={10 + i * 0.8}
              y2={16.3}
              stroke="white"
              strokeWidth="0.1"
            />
            <line
              x1={10 + i * 0.8}
              y1={37}
              x2={10 + i * 0.8}
              y2={38}
              stroke="white"
              strokeWidth="0.1"
            />
          </Fragment>
        ))}
      </g>
    )
  }
)
HashMarks.displayName = "HashMarks"

const YardNumbers = forwardRef<SVGGElement, YardNumberProps>(
  ({ orientation, startX = 10, spacing = 8, fontSize = 2, ...props }, ref) => {
    return (
      <g ref={ref} {...props}>
        {Array.from({ length: 10 }).map((_, i) => {
          const p = (i * 10) % 50
          const num = i * 10 > p ? 50 - p : i * 10
          const x = startX + i * spacing
          const y = orientation === "top" ? 10 : 43.3

          return (
            <text
              key={`${orientation}-${i}`}
              x={x}
              y={y}
              fill="white"
              fontSize={fontSize}
              textAnchor="middle"
              transform={
                orientation === "top" ? `rotate(180, ${x}, ${y})` : undefined
              }
            >
              {!!num && num}
            </text>
          )
        })}
      </g>
    )
  }
)
YardNumbers.displayName = "YardNumbers"

const CenterLogo = forwardRef<SVGGElement, CenterLogoProps>(
  ({ width = 0, height = 0, primaryColor, teamLogo, ...props }, ref) => {
    return (
      <g ref={ref} {...props}>
        <circle
          cx={width / 2}
          cy={height / 2}
          r={6}
          fill="none"
          stroke={primaryColor}
          strokeWidth="0.2"
        />
        <text
          x={width / 2}
          y={height / 2 + 2}
          fill={primaryColor}
          fontSize={6}
          textAnchor="middle"
          fontWeight="bold"
        >
          {teamLogo}
        </text>
      </g>
    )
  }
)
CenterLogo.displayName = "CenterLogo"

const FieldBorder = forwardRef<SVGRectElement, FieldBorderProps>(
  ({ width, height, secondaryColor, ...props }, ref) => {
    return (
      <rect
        ref={ref}
        x={0}
        y={0}
        width={width}
        height={height}
        fill="none"
        stroke={secondaryColor}
        strokeWidth="0.3"
        {...props}
      />
    )
  }
)
FieldBorder.displayName = "FieldBorder"

// Export the compound component
const FootballField = Object.assign(FootballFieldRoot, {
  EndZone,
  FieldLines,
  HashMarks,
  YardNumbers,
  CenterLogo,
  FieldBorder,
})

export default FootballField
