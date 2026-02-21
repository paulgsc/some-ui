import { filterCubeJson, result as validatedCubeJson } from "@slideshow/data"
import type { CubeJson, Question } from "@slideshow/types"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"
import { Bot, Code2, LineChart, Server } from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  AnimatedBadge,
  Card,
} from "some-ui-shared"

import { RotatingCube } from "."

type Story = StoryObj<typeof RotatingCube>
type Meta = MetaObj<typeof RotatingCube>

// --- Helper for generating the complex faces ---
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
]

const generateDataFaces = (): Array<React.JSX.Element> =>
  sections.map((section, index) => {
    const data = (validatedCubeJson.data ?? []) as Array<CubeJson>
    const options = ["What", "How", "Why"] as Array<Question>
    const selectedOption = options[Math.floor(Math.random() * options.length)]
    const filteredData = filterCubeJson(
      data,
      section.title,
      selectedOption
    ).pop()

    return (
      <Card key={index} className="relative size-full overflow-hidden p-1.5">
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
          <p className="text-muted-foreground text-sm">
            {filteredData?.abstract}
          </p>
          <Accordion
            type="multiple"
            defaultValue={filteredData?.answers.map((_, i) => `${i}`)}
            className="w-full"
          >
            {filteredData?.answers.map((answer, i) => (
              <AccordionItem key={i} value={`${i}`}>
                <AccordionTrigger>{answer.title}</AccordionTrigger>
                <AccordionContent>
                  <span className="text-sm">{answer.description}</span>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </Card>
    )
  })

// --- Stories ---

export default {
  title: "UI/Slideshow/Components/RotatingCube",
  component: RotatingCube,
} as Meta

export const Default: Story = {
  args: {
    perspective: 1250,
    dof: "Y-axis",
    className: "w-96 h-72",
    content: generateDataFaces(),
  },
  render: (args) => (
    <main className="flex items-center w-full min-h-screen justify-center">
      <RotatingCube {...args} />
    </main>
  ),
}

export const SimpleColors: Story = {
  args: {
    ...Default.args,
    content: [
      <div
        key="id_1"
        className="bg-red-500 size-full flex items-center justify-center text-white"
      >
        Face 1
      </div>,
      <div
        key="id_2"
        className="bg-blue-500 size-full flex items-center justify-center text-white"
      >
        Face 2
      </div>,
      <div
        key="id_3"
        className="bg-green-500 size-full flex items-center justify-center text-white"
      >
        Face 3
      </div>,
      <div
        key="id_4"
        className="bg-yellow-500 size-full flex items-center justify-center text-white"
      >
        Face 4
      </div>,
    ],
  },
}
