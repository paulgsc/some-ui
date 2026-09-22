import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { Slider } from "./slider"

type Story = StoryObj<typeof Slider>
type Meta = MetaObj<typeof Slider>

/** One value, one thumb — what every call site in this repo passes. */
export const Single: Story = {
  args: {
    defaultValue: [40],
    min: 0,
    max: 100,
    step: 1,
    className: "w-80",
    "aria-label": "Volume",
  },
}

/**
 * Two values, two thumbs. The thumb count is derived from the value array, so a
 * range is expressible without a second component; this used to render one
 * hardcoded thumb and silently drop the upper handle.
 */
export const Range: Story = {
  args: {
    defaultValue: [25, 75],
    min: 0,
    max: 100,
    step: 1,
    className: "w-80",
  },
}

/** Three values, to show the count really does follow the array. */
export const ThreeThumbs: Story = {
  args: {
    defaultValue: [20, 50, 80],
    min: 0,
    max: 100,
    step: 1,
    className: "w-80",
  },
}

const meta = {
  title: "UI/Shared/Slider",
  component: Slider,
} satisfies Meta

export default meta
