import { useState } from "react"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import type { PasswordFieldProps } from "."
import { PasswordField } from "."

type Story = StoryObj<typeof PasswordField>
type Meta = MetaObj<typeof PasswordField>

const ControlledPasswordField = (props: PasswordFieldProps) => {
  const [value, setValue] = useState(props.value)
  return <PasswordField {...props} value={value} onValueChange={setValue} />
}

export const Default: Story = {
  render: (args) => <ControlledPasswordField {...args} />,
  args: {
    id: "story-password",
    label: "Password",
    value: "",
    autoComplete: "current-password",
  },
}

/**
 * `autoComplete="new-password"` is what makes a password manager offer to
 * generate one instead of filling the existing password.
 */
export const NewPassword: Story = {
  render: (args) => <ControlledPasswordField {...args} />,
  args: {
    id: "story-new-password",
    label: "New password",
    value: "correct horse battery staple",
    autoComplete: "new-password",
    hint: "At least 12 characters. A passphrase works well.",
  },
}

export const WithError: Story = {
  render: (args) => <ControlledPasswordField {...args} />,
  args: {
    ...Default.args,
    value: "short",
    error: "Use at least 12 characters.",
  },
}

const meta: Meta = {
  title: "UI/Auth/Components/PasswordField",
  component: PasswordField,
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
