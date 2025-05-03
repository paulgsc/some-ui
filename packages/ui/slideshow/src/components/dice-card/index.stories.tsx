import { cubeEvents } from "@slideshow/hooks/use-rotating-cube"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { DiceCard } from "."

type Story = StoryObj<typeof DiceCard>
type Meta = MetaObj<typeof DiceCard>

cubeEvents.setState(() => ({ id: 1 }))

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
          onClick={() => cubeEvents.emit("rotate:pause", {})}
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
        <button onClick={() => cubeEvents.emit("rotate:next", {})}>
          Next Face
        </button>
        <button onClick={() => cubeEvents.emit("rotate:prev", {})}>
          Previous Face
        </button>
        <button onClick={() => cubeEvents.emit("rotate:to", { face: 2 })}>
          Go to Back Face
        </button>
      </div>

      <DiceCard {...args} />
    </main>
  ),
}

export const TwinParentControls: Story = {
  args: {
    className: "w-[250px] h-[150px]",
    faceClassName: "bg-sky-300/75",
    perspective: 1250,
    dof: "X-axis",
    mode: "manual",
    faces,
  },
  render: (args) => (
    <main className="flex h-96 min-h-screen flex-1 items-center justify-center">
      <div className="absolute top-0 flex w-full justify-between">
        <button onClick={() => cubeEvents.emit("rotate:next", { id: 1 })}>
          Next Face
        </button>
        <button onClick={() => cubeEvents.emit("rotate:prev", {})}>
          Previous Face
        </button>
        <button onClick={() => cubeEvents.emit("rotate:to", { face: 2 })}>
          Go to Back Face
        </button>
      </div>

      <div className="grid grid-flow-col gap-12">
        <DiceCard cubeId={1} {...args} />
        <DiceCard {...args} />
      </div>
    </main>
  ),
}
