import RotatingCube from "@slideshow/components/rotating-cube"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

type Story = StoryObj<typeof RotatingCube>
type Meta = MetaObj<typeof RotatingCube>

export const Default: Story = {}

export default { title: "SlideShow/RotatingCube", component: RotatingCube } as Meta
