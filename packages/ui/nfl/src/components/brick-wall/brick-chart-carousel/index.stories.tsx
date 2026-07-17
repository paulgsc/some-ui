// Import dummy/demo data only for Storybook
import { useNflTennis } from "@nfl/hooks/use-nfl-tennis"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

// Import the actual component
import { BrickChartCarousel } from "."

// Simulate data fetching in story
const MockedBrickChartWithProvider = () => {
  const { data: response, isLoading } = useNflTennis({})
  const { data: allWeeks, metadata } = response ?? {}

  return (
    <main className="absolute inset-0 h-screen w-screen">
      <BrickChartCarousel
        data={allWeeks ?? []}
        title={metadata?.title}
        isLoading={isLoading}
        autoplayDelay={2000}
        stopOnInteraction={true}
      />
    </main>
  )
}

type Story = StoryObj<typeof BrickChartCarousel>
type Meta = MetaObj<typeof BrickChartCarousel>

export const Default: Story = {
  render: () => <MockedBrickChartWithProvider />,
}

const meta = {
  title: "UI/NFL/Components/BrickChartCarousel",
  component: BrickChartCarousel,
  argTypes: {
    autoplayDelay: {
      control: { type: "number", min: 500, step: 500 },
      description: "Autoplay delay in milliseconds",
    },
    stopOnInteraction: {
      control: { type: "boolean" },
      description: "Pause autoplay on hover",
    },
    title: {
      control: { type: "text" },
      description: "Title passed to each BrickWallChart",
    },
  },
  args: {
    autoplayDelay: 2000,
    stopOnInteraction: true,
  },
} satisfies Meta

export default meta
