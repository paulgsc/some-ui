import { useVideoChapters } from "@slideshow/data/dial-data"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { Dial } from "."

type Story = StoryObj<typeof Dial>
type Meta = MetaObj<typeof Dial>

const animationDuration = 30000

export const Default: Story = {
  args: {
    center: 40,
    sections: [],
    animationDuration,
    uniformSections: true,
    animationPattern: "linear",
    className: "size-200",
  },
  render: (args) => {
    const params = {
      range: "dial!A1:D7",
    }
    const { data: sections, isLoading, error } = useVideoChapters({ ...params })

    if (isLoading) return <div>Loading...</div>

    if (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      return <div>error...{errorMessage}</div>
    }

    return <Dial {...args} sections={sections ?? []} />
  },
}

const meta = {
  title: "UI/Slideshow/Components/Dial/DialSVG",
  component: Dial,
} satisfies Meta

export default meta
