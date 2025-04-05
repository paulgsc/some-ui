import type { FC } from "react"
import { useCallback } from "react"
import { DiceCard } from "@slideshow/components/dice-card"
import { filterCubeJson, result as validatedCubeJson } from "@slideshow/data"
import type { AllowedRotationAxis } from "@slideshow/hooks/use-rotating-cube"
import type { CubeJson, Question } from "@slideshow/types"
import { processArray } from "@slideshow/utils/rotating-cube"
import { Bot, Code2, LineChart, Server } from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  AnimatedBadge,
  Card,
} from "some-ui-shared"

type RotatingCubeProps = {
  perspective?: number
  dof?: AllowedRotationAxis
  className?: string
  content?: Array<React.JSX.Element>
  duration?: number
}

export const RotatingCube: FC<RotatingCubeProps> = ({
  perspective = 1200,
  dof = "Y-axis",
  content = [],
  duration = 3000,
  className,
}): React.JSX.Element => {
  const getFaces = useCallback(() => {
    const faces = [...cubeFaces(), ...content]
    return processArray(faces, 4)
  }, [content])

  return (
    <DiceCard
      className={className}
      dof={dof}
      faces={getFaces()}
      perspective={perspective}
      duration={duration}
    />
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
