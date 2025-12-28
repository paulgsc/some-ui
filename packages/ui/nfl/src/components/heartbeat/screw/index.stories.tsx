import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { Screw } from "."

type Story = StoryObj<typeof Screw>
type Meta = MetaObj<typeof Screw>

export const Default: Story = {
  args: {
    cx: 110,
    cy: 15,
  },
  render: (args) => (
    <svg
      id="screwHead"
      width="200"
      height="200"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient
          id="metalGradient"
          cx="50%"
          cy="50%"
          r="70%"
          fx="50%"
          fy="50%"
        >
          <stop offset="0%" stop-color="#f0f0f0" />
          <stop offset="50%" stop-color="#d0d0d0" />
          <stop offset="100%" stop-color="#b0b0b0" />
        </radialGradient>
        <radialGradient
          id="recessGradient"
          cx="50%"
          cy="50%"
          r="40%"
          fx="50%"
          fy="50%"
        >
          <stop offset="0%" stop-color="#808080" />
          <stop offset="70%" stop-color="#a0a0a0" />
          <stop offset="100%" stop-color="#c0c0c0" />
        </radialGradient>
      </defs>

      <circle
        cx="50"
        cy="50"
        r="45"
        fill="url(#metalGradient)"
        stroke="#888"
        stroke-width="1"
      />

      <path
        d="M 50 30 L 42.725 46.325 L 25 47.555 L 36.325 60.675 L 32.725 77.675 L 50 68.3 L 67.275 77.675 L 63.675 60.675 L 75 47.555 L 57.275 46.325 Z"
        fill="url(#recessGradient)"
        stroke="#666"
        stroke-width="0.5"
      />
    </svg>
  ),
}

export default {
  title: "UI/NFL/Components/Cardiogram/Screw",
  component: Screw,
} as Meta
