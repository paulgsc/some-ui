// components/ui/draggable-container.stories.tsx
import type { Meta, StoryObj } from "@storybook/react"

import { DraggableContainer, DraggableItem } from "."

const meta: Meta<typeof DraggableContainer> = {
  title: "Components/DraggableContainer",
  component: DraggableContainer,
  parameters: {
    layout: "centered",
  },
}

export default meta
type Story = StoryObj<typeof DraggableContainer>

const PlayerIcon = ({
  position,
  number,
}: {
  position: string
  number: string
}) => (
  <div className="flex flex-col items-center">
    <div className="flex size-12 items-center justify-center rounded-full border-2 border-black bg-white font-bold">
      {number}
    </div>
    <span className="mt-1 text-xs font-medium">{position}</span>
  </div>
)

export const NFLFormation: Story = {
  render: () => (
    <DraggableContainer className="size-[720px] bg-green-600">
      {/* Offensive Line */}
      <DraggableItem id="c" initialPosition={{ x: 50, y: 70 }}>
        <PlayerIcon position="C" number="50" />
      </DraggableItem>
      <DraggableItem id="lg" initialPosition={{ x: 42, y: 70 }}>
        <PlayerIcon position="LG" number="65" />
      </DraggableItem>
      <DraggableItem id="rg" initialPosition={{ x: 58, y: 70 }}>
        <PlayerIcon position="RG" number="73" />
      </DraggableItem>
      <DraggableItem id="lt" initialPosition={{ x: 34, y: 70 }}>
        <PlayerIcon position="LT" number="77" />
      </DraggableItem>
      <DraggableItem id="rt" initialPosition={{ x: 66, y: 70 }}>
        <PlayerIcon position="RT" number="71" />
      </DraggableItem>

      {/* Skill Positions */}
      <DraggableItem id="qb" initialPosition={{ x: 50, y: 80 }}>
        <PlayerIcon position="QB" number="12" />
      </DraggableItem>
      <DraggableItem id="rb" initialPosition={{ x: 50, y: 90 }}>
        <PlayerIcon position="RB" number="28" />
      </DraggableItem>

      {/* Wide Receivers */}
      <DraggableItem id="wr1" initialPosition={{ x: 15, y: 70 }}>
        <PlayerIcon position="WR" number="11" />
      </DraggableItem>
      <DraggableItem id="wr2" initialPosition={{ x: 85, y: 70 }}>
        <PlayerIcon position="WR" number="17" />
      </DraggableItem>
      <DraggableItem id="slot1" initialPosition={{ x: 25, y: 75 }}>
        <PlayerIcon position="WR" number="80" />
      </DraggableItem>
      <DraggableItem id="te" initialPosition={{ x: 75, y: 75 }}>
        <PlayerIcon position="TE" number="85" />
      </DraggableItem>
    </DraggableContainer>
  ),
}
