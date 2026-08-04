import { useState } from "react"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import type { AuthFieldProps } from "."
import { AuthField } from "."

type Story = StoryObj<typeof AuthField>
type Meta = MetaObj<typeof AuthField>

/**
 * The field is fully controlled, so a story needs somewhere to keep the value.
 * Defined at module scope rather than inline in `render` — a component declared
 * during render remounts on every keystroke and loses focus.
 */
const ControlledField = (props: AuthFieldProps) => {
  const [value, setValue] = useState(props.value)
  return <AuthField {...props} value={value} onValueChange={setValue} />
}

export const Default: Story = {
  render: (args) => <ControlledField {...args} />,
  args: {
    id: "story-email",
    label: "Email",
    type: "email",
    value: "",
    placeholder: "you@example.com",
    autoComplete: "username",
  },
}

/** `aria-invalid` flips and the message is wired via `aria-describedby`. */
export const WithError: Story = {
  render: (args) => <ControlledField {...args} />,
  args: {
    ...Default.args,
    value: "not-an-email",
    error: "Enter a valid email address.",
  },
}

export const WithHint: Story = {
  render: (args) => <ControlledField {...args} />,
  args: {
    ...Default.args,
    hint: "We only use this to sign you in.",
  },
}

/** `labelAction` is the slot the "Forgot password?" link lives in. */
export const WithLabelAction: Story = {
  render: (args) => <ControlledField {...args} />,
  args: {
    ...Default.args,
    label: "Password",
    labelAction: (
      <span className="text-muted-foreground text-xs">Forgot password?</span>
    ),
  },
}

export const Disabled: Story = {
  render: (args) => <ControlledField {...args} />,
  args: {
    ...Default.args,
    value: "you@example.com",
    disabled: true,
  },
}

const meta: Meta = {
  title: "UI/Auth/Components/AuthField",
  component: AuthField,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
}

export default meta
