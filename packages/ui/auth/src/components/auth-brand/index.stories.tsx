import type { Meta, StoryObj } from "@storybook/react-vite"

import { AuthBrand } from "."

type Story = StoryObj<typeof AuthBrand>

export const Default: Story = {}

export const CustomProductName: Story = {
  args: { name: "Some Studio" },
}

const meta: Meta<typeof AuthBrand> = {
  title: "UI/Auth/Components/AuthBrand",
  component: AuthBrand,
  tags: ["autodocs"],
}

export default meta
