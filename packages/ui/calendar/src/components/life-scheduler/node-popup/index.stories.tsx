import type { Meta, StoryObj } from "@storybook/react-vite"

import { NodePopup } from "."

const meta: Meta<typeof NodePopup> = {
  title: "UI/Calendar/Scheduler/Components/NodePopup",
  component: NodePopup,
  parameters: {
    layout: "centered",
    backgrounds: {
      default: "dark",
      values: [{ name: "dark", value: "#121110" }],
    },
  },
  tags: ["autodocs"],
  argTypes: {
    onClose: { action: "closed" },
  },
}

export default meta
type Story = StoryObj<typeof NodePopup>

const mockData = {
  label: "System Monitor",
  description:
    "Real-time lifecycle management for high-frequency trading buffers and node synchronization.",
  bucket: "PROD-A",
  slot: "0x4F2",
  load: 65,
  tasks: [
    {
      name: "Buffer Flush",
      status: "ok" as const,
      interval: "2ms",
      lastRun: "1.2s ago",
    },
    {
      name: "Ping Check",
      status: "warn" as const,
      interval: "10s",
      lastRun: "5s ago",
    },
    {
      name: "Auth Sync",
      status: "err" as const,
      interval: "1m",
      lastRun: "failed",
    },
  ],
}

export const OuterNode: Story = {
  args: {
    type: "outer",
    nodeIndex: 12,
    data: mockData,
  },
  render: (args) => (
    <div className="w-[400px]">
      <NodePopup {...args} />
    </div>
  ),
}

export const InnerNode: Story = {
  args: {
    type: "inner",
    nodeIndex: 45,
    data: {
      ...mockData,
      label: "Sub-Process",
      load: 20,
    },
  },
  render: (args) => (
    <div className="w-[400px]">
      <NodePopup {...args} />
    </div>
  ),
}

export const CriticalLoad: Story = {
  args: {
    type: "outer",
    nodeIndex: 5,
    data: {
      ...mockData,
      label: "Heavy Compute",
      load: 92,
    },
  },
  render: (args) => (
    <div className="w-[400px]">
      <NodePopup {...args} />
    </div>
  ),
}
