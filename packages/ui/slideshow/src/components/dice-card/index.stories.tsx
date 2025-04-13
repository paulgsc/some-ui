import { cubeEventBus } from "@slideshow/hooks/use-cube-events"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { DiceCard } from "."

type Story = StoryObj<typeof DiceCard>
type Meta = MetaObj<typeof DiceCard>

const faces = Array.from({ length: 6 }, (_, i) => (
  <span key={i} className="size-full">{`foo ${i}`}</span>
))

export const Default: Story = {
  args: {
    className: "w-[500px] h-[300px]",
    faceClassName: "bg-sky-300/75",
    perspective: 1250,
    dof: "X-axis",
    faces,
  },
  render: (args) => (
    <main className="flex h-96 min-h-screen flex-1 items-center justify-center">
      <DiceCard {...args} />
    </main>
  ),
}

export default {
  title: "UI/Slideshow/Components/DiceCard",
  component: DiceCard,
} as Meta

export const PausAnimation: Story = {
  args: {
    className: "w-[500px] h-[300px]",
    faceClassName: "bg-sky-300/75",
    perspective: 1250,
    dof: "X-axis",
    mode: "autoplay",
    faces,
  },
  render: (args) => (
    <main className="flex h-96 min-h-screen flex-1 items-center justify-center">
      <div className="absolute top-0 flex w-full justify-center">
        <button
          className="cursor-pointer rounded-lg bg-blue-400 p-2.5 text-center shadow-md"
          onClick={() => cubeEventBus.emit("rotate:pause", undefined)}
        >
          Pause
        </button>
      </div>
      <DiceCard {...args} />
    </main>
  ),
}

export const ParentControls: Story = {
  args: {
    className: "w-[500px] h-[300px]",
    faceClassName: "bg-sky-300/75",
    perspective: 1250,
    dof: "X-axis",
    mode: "manual",
    faces,
  },
  render: (args) => (
    <main className="flex h-96 min-h-screen flex-1 items-center justify-center">
      <div className="absolute top-0 flex w-full justify-between">
        <button onClick={() => cubeEventBus.emit("rotate:next", undefined)}>
          Next Face
        </button>
        <button onClick={() => cubeEventBus.emit("rotate:prev", undefined)}>
          Previous Face
        </button>
        <button onClick={() => cubeEventBus.emit("rotate:to", { face: 2 })}>
          Go to Back Face
        </button>
      </div>

      <DiceCard {...args} />
    </main>
  ),
}
