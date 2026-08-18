import { AuthCard } from "@auth/components/auth-card"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { ResetPasswordForm } from "."

type Story = StoryObj<typeof ResetPasswordForm>
type Meta = MetaObj<typeof ResetPasswordForm>

export const Default: Story = {
  args: {},
}

/** The address is display-only. The reset token never reaches this component. */
export const WithEmail: Story = {
  args: {
    email: "you@example.com",
  },
}

export const Pending: Story = {
  args: {
    email: "you@example.com",
    pending: true,
  },
}

export const ExpiredToken: Story = {
  args: {
    error: "That reset link has expired. Request a new one.",
  },
}

const meta: Meta = {
  title: "UI/Auth/Components/ResetPasswordForm",
  component: ResetPasswordForm,
  tags: ["autodocs"],
  argTypes: {
    onSubmit: { action: "password reset" },
  },
  decorators: [
    (Story) => (
      <AuthCard title="Set a new password">
        <Story />
      </AuthCard>
    ),
  ],
}

export default meta
