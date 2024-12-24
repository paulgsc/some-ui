import type { Meta, Story } from "@storybook/react"

import NeonSignText from "."

const meta: Meta = {
  title: "Components/NeonSign",
  component: NeonSignText,
  argTypes: {
    text: { control: "text", description: "Text to display in neon effect" },
  },
  parameters: {
    layout: "centered",
  },
}

export default meta

const Template: Story<{ text: string }> = (args) => <NeonSignText {...args} />

export const Default = Template.bind({})
Default.args = {
  text: "CODE PEN",
}

export const CustomText = Template.bind({})
CustomText.args = {
  text: "HELLO WORLD",
}
