import type { FC } from "react"
import { cn } from "some-ui-utils"

const VIEWBOX_PARAMS = [0, 0, 100, 100]

type NflPlayerCardProps = {
  className?: string
}

const dimensions = {
  width: VIEWBOX_PARAMS[3] * 0.35,
  height: VIEWBOX_PARAMS[3] * 0.5,
  padding: VIEWBOX_PARAMS[3] * 0.01,
  borderRadius: VIEWBOX_PARAMS[3] * 0.02,
} as const

export const NflPlayerCard: FC<NflPlayerCardProps> = ({ className }) => {
  const { padding, height, width, borderRadius } = dimensions
  const titleHeight = height * 0.1
  const imageHeight = Math.max(0, height - titleHeight) * 0.35
  const typeHeight = Math.max(0, height - titleHeight - imageHeight) * 0.075
  const descriptionHeight =
    Math.max(0, height - titleHeight - imageHeight - typeHeight) * 0.65
  const footerHeight =
    Math.max(
      0,
      height - titleHeight - imageHeight - typeHeight - descriptionHeight
    ) * 0.65

  let y = 0

  return (
    <svg
      viewBox={VIEWBOX_PARAMS.join(" ")}
      preserveAspectRatio="xMidYMid meet"
      className={cn("size-full", className)}
    >
      <CardBorder
        padding={padding}
        width={width}
        height={height}
        borderRadius={borderRadius}
      />
      <CardTitle
        title="Exodia the Forbidden One"
        stars={5}
        width={width - padding * 2}
        height={titleHeight}
        x={padding}
        y={(y = padding)}
      />
      <CardImage
        width={width - padding * 2}
        height={imageHeight}
        x={padding}
        y={(y += titleHeight * 1.05)}
      />
      <CardType
        type="Spellcaster"
        width={width - padding * 2}
        height={typeHeight}
        x={padding}
        y={(y += imageHeight)}
      />

      <CardDescription
        description="A forbidden right leg sealed by magic. Whosoever breaks this seal will know infinite power."
        width={width - padding * 2}
        height={descriptionHeight}
        x={padding}
        y={(y += typeHeight)}
      />
      <CardFooter
        attack={1000}
        defense={1000}
        jersey={99}
        width={width - padding * 2}
        height={footerHeight}
        x={padding}
        y={0.85 * height}
      />
    </svg>
  )
}

type CardBorderProps = typeof dimensions

const CardBorder: FC<CardBorderProps> = ({ borderRadius, width, height }) => {
  return (
    <rect
      x={0}
      y={0}
      rx={borderRadius}
      ry={borderRadius}
      width={width}
      height={height}
      stroke="#333"
      strokeWidth={0.02}
      className="fill-black"
    />
  )
}

type CardTitleProps = {
  title: string
  stars: number
  width: number
  height: number
  x: number
  y: number
}

const CardTitle: FC<CardTitleProps> = ({
  title,
  stars,
  width,
  height,
  x,
  y,
}) => {
  const fontSize = height * 0.3
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect width={width} height={height} fill="#eee8d5" />
      <text
        x={0.1 * width}
        y={(height + fontSize * 0.5) * 0.5}
        fontSize={fontSize}
        fontWeight="bold"
      >
        {title} {"★".repeat(stars)}
      </text>
    </g>
  )
}

type CardImageProps = {
  width: number
  height: number
  x: number
  y: number
  href?: string
  alt?: string
}

const CardImage: FC<CardImageProps> = ({ width, height, x, y }) => {
  return (
    <image
      href="https://www.cbssports.com/_next/image?url=https%3A%2F%2Fsportshub.cbsistatic.com%2Fi%2Fsports%2Fplayer%2Fheadshot%2F28873918.png%3Fwidth%3D200&w=1920&q=75"
      x={x}
      y={y}
      width={width}
      height={height}
      preserveAspectRatio="xMidYMid slice"
    />
  )
}

type CardTypeProps = {
  width: number
  height: number
  x: number
  y: number
  type: string
}

const CardType: FC<CardTypeProps> = ({ type, width, height, x, y }) => {
  const fontSize = height * 0.15
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect width={width} height={height} fill="#f5f5dc" />
      <text x={8} y={height / 2 + 5} fontSize={fontSize} fontStyle="italic">
        {type}
      </text>
    </g>
  )
}

type CardDescriptionProps = {
  width: number
  height: number
  x: number
  y: number
  description: string
}

const CardDescription: FC<CardDescriptionProps> = ({
  description,
  width,
  height,
  x,
  y,
}) => {
  const fontSize = height * 0.075
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect
        width={width}
        height={height}
        rx={0.025 * height}
        className="fill-gray-400/60"
        fill="currentColor"
      />
      <foreignObject width={width} height={height}>
        <div
          style={{
            textAlign: "left",
            textWrap: "balance",
            fontSize: `${fontSize}px`,
            letterSpacing: " -0.025em",
            padding: "1px",
            color: "white",
          }}
        >
          {description}
        </div>
      </foreignObject>
    </g>
  )
}

type CardFooterProps = {
  x: number
  y: number
  width: number
  height: number
  attack: number
  defense: number
  jersey: number
}

const CardFooter: FC<CardFooterProps> = ({
  attack,
  defense,
  jersey,
  width,
  height,
  x,
  y,
}) => {
  const fontSize = height * 0.15
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect
        width={width}
        height={height}
        rx={height * 0.1}
        className="fill-blue-200"
      />
      <text x={fontSize} y={height * 0.5} fontSize={fontSize} fontWeight="bold">
        Grade/{attack} Positon/{defense} {jersey}
      </text>
      <image
        href="https://sports.cbsimg.net/fly/images/team-logos/429.svg"
        x={width * 0.75}
        width={height * 0.85}
        height={height * 0.85}
        preserveAspectRatio="xMidYMid slice"
      />
    </g>
  )
}
