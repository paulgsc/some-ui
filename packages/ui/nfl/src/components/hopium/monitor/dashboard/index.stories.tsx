import { MockSatelliteAdapter } from "@nfl/lib/hopium/adapters/mock-adapter"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { SatelliteDashboard } from "."

type Story = StoryObj<typeof SatelliteDashboard>
type Meta = MetaObj<typeof SatelliteDashboard>

const adapter = new MockSatelliteAdapter()

export const Default: Story = {
  args: {
    adapter,
    title: "Data Monitor",
    autoRefreshInterval: 3000,
  },
}

const meta = {
  title: "UI/NFL/Components/Hopium/Monitor/SatelliteDashboard",
  component: SatelliteDashboard,
} satisfies Meta

export default meta
