import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { NeuralNetworkSVG } from "."

type Story = StoryObj<typeof NeuralNetworkSVG>
type Meta = MetaObj<typeof NeuralNetworkSVG>

export const Default: Story = {}

const meta: Meta = {
  title: "UI/Honeycomb/Components/NeuralNetworkSVG",
  component: NeuralNetworkSVG,
}
export default meta
