import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { Brick } from "."

type Story = StoryObj<typeof Brick>
type Meta = MetaObj<typeof Brick>

export const Default: Story = {
  args: {
    brick: {
      position: {
        x: 0,
        y: 0,
        width: 80,
        height: 80,
      },
      item: {
        name: "SF",
        value: 11,
        imageUrl:
          "https://t3.gstatic.com/faviconV2?url=https://www.49ers.com/&client=BARD&type=FAVICON&size=256&fallback_opts=TYPE,SIZE,URL",
      },
      color_intensity: 5,
    },
  },
  render: (args) => (
    <main className="size-96 border border-red-500">
      <svg viewBox="0 0 100 100" className="size-full">
        <Brick {...args} />
      </svg>
    </main>
  ),
}

export default {
  title: "UI/NFL/Components/Brick",
  component: Brick,
} as Meta
