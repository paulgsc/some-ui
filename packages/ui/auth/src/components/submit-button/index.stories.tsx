import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { AuthSubmitButton } from "."

type Story = StoryObj<typeof AuthSubmitButton>
type Meta = MetaObj<typeof AuthSubmitButton>

export const Default: Story = {
  args: {
    children: "Sign in",
  },
}

/**
 * The label does not change while pending. Swapping it for "Signing in…"
 * resizes the button under the cursor at the moment the user is most likely
 * to click again.
 */
export const Pending: Story = {
  args: {
    children: "Sign in",
    pending: true,
    pendingLabel: "Signing in",
  },
}

export const Disabled: Story = {
  args: {
    children: "Sign in",
    disabled: true,
  },
}

const meta: Meta = {
  title: "UI/Auth/Components/AuthSubmitButton",
  component: AuthSubmitButton,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
}

export default meta
