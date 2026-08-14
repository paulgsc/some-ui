import { useState } from "react"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import type { CheckboxFieldProps } from "."
import { CheckboxField } from "."

type Story = StoryObj<typeof CheckboxField>
type Meta = MetaObj<typeof CheckboxField>

const ControlledCheckboxField = (props: CheckboxFieldProps) => {
  const [checked, setChecked] = useState(props.checked)
  return (
    <CheckboxField {...props} checked={checked} onCheckedChange={setChecked} />
  )
}

export const RememberMe: Story = {
  render: (args) => <ControlledCheckboxField {...args} />,
  args: {
    id: "story-remember",
    label: "Keep me signed in on this device",
    checked: false,
  },
}

export const Terms: Story = {
  render: (args) => <ControlledCheckboxField {...args} />,
  args: {
    id: "story-terms",
    label: "I agree to the terms of service and privacy policy",
    checked: false,
  },
}

export const WithError: Story = {
  render: (args) => <ControlledCheckboxField {...args} />,
  args: {
    ...Terms.args,
    error: "Accept the terms to continue.",
  },
}

const meta: Meta = {
  title: "UI/Auth/Components/CheckboxField",
  component: CheckboxField,
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
