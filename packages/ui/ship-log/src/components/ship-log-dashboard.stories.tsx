import type { Meta, StoryObj } from "@storybook/react-vite"

import { ShipLogDashboard } from "./ship-log-dashboard"

const meta = {
  title: "UI/Ship Log/Dashboard",
  component: ShipLogDashboard,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ShipLogDashboard>

export default meta
type Story = StoryObj<typeof meta>

export const FixedDesktopViewport: Story = {}
