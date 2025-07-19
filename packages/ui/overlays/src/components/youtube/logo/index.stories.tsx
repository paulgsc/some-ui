import Logo from "@overlays/components/youtube/logo"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

type Story = StoryObj<typeof Logo>
type Meta = MetaObj<typeof Logo>

export const Default: Story = {}

export default { title: "Overlays/Youtube/Logo", component: Logo } as Meta
