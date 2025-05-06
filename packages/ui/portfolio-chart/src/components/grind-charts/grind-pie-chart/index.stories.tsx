import type { JobApplication } from "@portfolio-chart/types/grind-charts"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { GrindPieChart } from "."

const sampleJobApplications: Array<JobApplication> = [
  { name: "Hopium", value: 42, color: "#3B82F6" },
  { name: "Society Wins Again", value: 15, color: "#10B981" },
  { name: "Never began", value: 3, color: "#F59E0B" },
  { name: "Crickets", value: 24, color: "#EF4444" },
]

type Story = StoryObj<typeof GrindPieChart>
type Meta = MetaObj<typeof GrindPieChart>

export const Default: Story = {
  args: {
    stats: sampleJobApplications,
    title: "job applications",
  },
}

export default {
  title: "UI/PortfolioChart/Components/GrindCharts/GrindPieChart",
  component: GrindPieChart,
} as Meta
