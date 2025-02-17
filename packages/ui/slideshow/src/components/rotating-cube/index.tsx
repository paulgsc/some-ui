import type { CSSProperties, FC, RefObject } from "react"
import { useRef } from "react"
import { filterCubeJson, result as validatedCubeJson } from "@slideshow/data"
import { useRotatingCube } from "@slideshow/hooks"
import type { CubeJson, Question } from "@slideshow/types"
import { Bot, Code2, LineChart, Server } from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  AnimatedBadge,
  Card,
} from "some-ui-shared"
import { cn, useMeasureRect } from "some-ui-utils"

type RotatingCubeProps = {
  perspective?: number
}

export const RotatingCube: FC<RotatingCubeProps> = ({
  perspective = 1200,
}): React.JSX.Element => {
  const { isRotating, currentFace, totalRotation, setIsRotating } =
    useRotatingCube()
  const faces = cubeFaces()
  const ref = useRef<HTMLDivElement>(null)

  const { width } = useMeasureRect({
    ref: ref as RefObject<HTMLElement>,
  })

  return (
    <div
      style={{ "--perspective": perspective } as CSSProperties}
      className={cn(
        "flex size-10/12 items-center justify-center [perspective:calc(var(--perspective)*1px)]"
      )}
    >
      <div
        ref={ref}
        className={cn(
          "transform-3d relative size-full max-w-sm transition-transform duration-500",
          "[transform:rotateY(calc(var(--cube-rotation)*1deg))]"
        )}
        style={
          {
            "--cube-rotation": -totalRotation,
          } as CSSProperties
        }
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
              <div className="bg-muted pointer-events-none absolute inset-0 -z-10 size-full rounded-xl brightness-50" />
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
    title: "Nest",
    inProgress: true,
  },
  {
    icon: <Code2 className="size-8 text-blue-500" />,
    title: "TypeScript Overlay UI",
    inProgress: false,
  },
  {
    icon: <LineChart className="size-8 text-blue-500" />,
    title: "ChessNFL",
    inProgress: false,
  },
  {
    icon: <Bot className="size-8 text-blue-500" />,
    title: "Chatbot Blog",
    inProgress: false,
  },
] as const

const cubeFaces = (): Array<React.JSX.Element> =>
  sections.map((section, index) => {
    const data = (validatedCubeJson.data ??
      ([] as Array<CubeJson>)) satisfies Array<CubeJson>
    const options = ["What", "How", "Why"] satisfies Array<Question>
    const selectedOption = options[Math.floor(Math.random() * options.length)]
    const filteredData = filterCubeJson(
      data,
      section.title,
      selectedOption
    ).pop()

    return (
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
          <div className="flex flex-1 items-center justify-between px-2">
            <div className="inline-block rounded-lg bg-blue-50 p-3">
              {section.icon}
            </div>
            {section.inProgress && <AnimatedBadge />}
          </div>
          <h3 className="text-xl font-semibold tracking-tight">
            {section.title}
          </h3>

          {/* Description */}
          <p className="text-muted-foreground text-sm">
            {filteredData?.abstract}
          </p>

          {/* Features list */}
          <Accordion
            type="multiple"
            defaultValue={filteredData?.answers.map((_, index) => `${index}`)}
            className="w-full"
          >
            {filteredData?.answers.map((answer, index) => {
              return (
                <AccordionItem key={index} value={`${index}`}>
                  <AccordionTrigger>{answer.title}</AccordionTrigger>
                  <AccordionContent>
                    <span className="text-sm">{answer.description}</span>
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
        </div>
      </Card>
    )
  })
