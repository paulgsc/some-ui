import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { GraphSelect } from "."

const meta: MetaObj<typeof GraphSelect> = {
  title: "UI/Input/Components/Mathlingo/GraphSelect",
  component: GraphSelect,
  tags: ["autodocs"],
  argTypes: {
    onSubmit: { action: "submitted" },
  },
}

export default meta
type Story = StoryObj<typeof GraphSelect>

const mockRegions = [
  { id: "1", label: "A1", x: 10, y: 10, width: 20, height: 30 },
  { id: "2", label: "B2", x: 40, y: 15, width: 25, height: 25 },
  { id: "3", label: "C3", x: 70, y: 50, width: 20, height: 40 },
  { id: "4", label: "D4", x: 15, y: 60, width: 30, height: 20 },
]

export const SingleSelect: Story = {
  args: {
    regions: mockRegions,
    multiSelect: false,
    disabled: false,
  },
}

export const MultiSelect: Story = {
  args: {
    regions: mockRegions,
    multiSelect: true,
    disabled: false,
  },
}

export const CorrectResult: Story = {
  args: {
    regions: mockRegions,
    multiSelect: true,
    showResult: true,
    correctRegions: ["1", "2"],
    // Simulating that user selected 1 and 2 correctly
  },
  parameters: {
    docs: {
      description: {
        story:
          "Displays regions with the 'success' theme when correctly identified.",
      },
    },
  },
}

export const IncorrectResult: Story = {
  render: (args) => (
    <div className="w-[500px]">
      <GraphSelect {...args} />
    </div>
  ),
  args: {
    regions: mockRegions,
    multiSelect: true,
    showResult: true,
    correctRegions: ["1"],
    // We'll assume the component state has ID '2' selected (Wrong)
    // and ID '1' was missed.
  },
}

export const Disabled: Story = {
  args: {
    regions: mockRegions,
    disabled: true,
  },
}
