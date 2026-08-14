import { useState } from "react"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import type { CodeInputProps } from "."
import { CodeInput } from "."

type Story = StoryObj<typeof CodeInput>
type Meta = MetaObj<typeof CodeInput>

const ControlledCodeInput = (props: CodeInputProps) => {
  const [value, setValue] = useState(props.value)
  return <CodeInput {...props} value={value} onValueChange={setValue} />
}

/**
 * Type to advance, backspace on an empty box to step back, arrow keys to move,
 * and paste a full code into any box to fill the whole group.
 */
export const Default: Story = {
  render: (args) => <ControlledCodeInput {...args} />,
  args: {
    id: "story-code",
    label: "Verification code",
    value: "",
  },
}

export const PartiallyFilled: Story = {
  render: (args) => <ControlledCodeInput {...args} />,
  args: {
    ...Default.args,
    value: "123",
  },
}

export const WithError: Story = {
  render: (args) => <ControlledCodeInput {...args} />,
  args: {
    ...Default.args,
    value: "123456",
    error: "That code is not valid. Request a new one.",
  },
}

/** Length is a prop — some backends issue four or eight digits. */
export const FourDigits: Story = {
  render: (args) => <ControlledCodeInput {...args} />,
  args: {
    ...Default.args,
    length: 4,
  },
}

export const Disabled: Story = {
  render: (args) => <ControlledCodeInput {...args} />,
  args: {
    ...Default.args,
    value: "123456",
    disabled: true,
  },
}

const meta: Meta = {
  title: "UI/Auth/Components/CodeInput",
  component: CodeInput,
  tags: ["autodocs"],
}

export default meta
