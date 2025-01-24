import type { CSSProperties, RefObject } from "react"
import { useRef } from "react"
import { useRotatingCube } from "@slideshow/hooks"
import { Bot, Code2, LineChart, Server } from "lucide-react"
import { Card } from "some-ui-shared"
import { cn, useMeasureRect } from "some-ui-utils"

import styles from "./index.module.css"

const RotatingCube = (): React.JSX.Element => {
  const { isRotating, currentFace, setIsRotating } = useRotatingCube()
  const faces = cubeFaces()
  const ref = useRef<HTMLDivElement>(null)

  const { width } = useMeasureRect({
    ref: ref as RefObject<HTMLElement>,
  })

  return (
    <div
      style={{ perspective: "1150px" }}
      className="flex size-10/12 items-center justify-center"
    >
      <div
        ref={ref}
        className={cn(
          "preserve-3d relative size-full max-w-sm transition-transform duration-500",
          { [styles.rotating]: true }
        )}
        style={{ transform: `rotateY(-${currentFace * 90}deg)` }}
        onMouseEnter={() => setIsRotating(false)}
        onMouseLeave={() => setIsRotating(true)}
      >
        {faces.map((face, index) => (
          <div
            key={index}
            style={{ "--face-width": (width ?? 0) / 2 } as CSSProperties}
            className={cn(
              "absolute z-10 flex size-full items-center justify-center rounded-lg shadow-inner transition-colors",
              {
                "[transform:rotateY(0deg)_translateZ(calc(var(--face-width)*1px))]":
                  index === 0,
                "[transform:rotateY(90deg)_translateZ(calc(var(--face-width)*1px))]":
                  index === 1,
                "[transform:rotateY(180deg)_translateZ(calc(var(--face-width)*1px))]":
                  index === 2,
                "[transform:rotateY(-90deg)_translateZ(calc(var(--face-width)*1px))]":
                  index === 3,
                "opacity-80": isRotating,
              }
            )}
          >
            {currentFace !== index && (
              <div className="pointer-events-none absolute inset-0 -z-10 size-full rounded-xl bg-muted brightness-50" />
            )}
            {currentFace === index && face}
          </div>
        ))}
      </div>
    </div>
  )
}

const sections = [
  {
    icon: <Server className="size-8 text-blue-500" />,
    title: "Rust Axum Server",
    description:
      "High-performance backend infrastructure built with Rust and Axum framework",
    features: [
      "RESTful API endpoints",
      "WebSocket connections",
      "Database integration",
      "Error handling middleware",
    ],
  },
  {
    icon: <Code2 className="size-8 text-blue-500" />,
    title: "TypeScript Overlay UI",
    description: "Modern streaming overlay built with TypeScript and React",
    features: [
      "Custom animations",
      "Real-time updates",
      "Stream notifications",
      "Viewer interactions",
    ],
  },
  {
    icon: <LineChart className="size-8 text-blue-500" />,
    title: "Trading Analyzer",
    description: "Real-time market analysis and trading insights",
    features: [
      "Price tracking",
      "Technical indicators",
      "Market trends",
      "Trading signals",
    ],
  },
  {
    icon: <Bot className="size-8 text-blue-500" />,
    title: "Chatbot Blog",
    description: "Interactive AI-powered blog system",
    features: [
      "Natural language processing",
      "Content generation",
      "User interactions",
      "Learning algorithms",
    ],
  },
]

const cubeFaces = (): Array<React.JSX.Element> =>
  sections.map((section, index) => (
    <Card key={index} className="relative size-full overflow-hidden p-6">
      {/* Background pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, black 1px, transparent 0)",
          backgroundSize: "20px 20px",
        }}
      />

      <div className="relative space-y-4">
        {/* Icon */}
        <div className="inline-block rounded-lg bg-blue-50 p-3">
          {section.icon}
        </div>

        {/* Title */}
        <h3 className="text-xl font-semibold tracking-tight">
          {section.title}
        </h3>

        {/* Description */}
        <p className="text-sm text-muted-foreground">{section.description}</p>

        {/* Features list */}
        <ul className="space-y-2">
          {section.features.map((feature, featureIndex) => (
            <li key={featureIndex} className="flex items-center gap-2">
              <svg
                className="size-4 shrink-0 text-blue-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  ))

export default RotatingCube
