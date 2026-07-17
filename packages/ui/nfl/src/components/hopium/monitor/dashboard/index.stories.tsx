import { MockSatelliteAdapter } from "@nfl/lib/hopium/adapters/mock-adapter"
import type { MockSatelliteData } from "@nfl/types/hopium/hopium-tracker"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { SatelliteDashboard } from "."

// Supply the generic parameter to Storybook's type utilities
type Story = StoryObj<typeof SatelliteDashboard<MockSatelliteData>>
type Meta = MetaObj<typeof SatelliteDashboard<MockSatelliteData>>

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
