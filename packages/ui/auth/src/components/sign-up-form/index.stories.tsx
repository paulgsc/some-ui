import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { SignUpForm } from "."
import { AuthCard } from "../auth-card"

type Story = StoryObj<typeof SignUpForm>
type Meta = MetaObj<typeof SignUpForm>

/**
 * Submit with mismatched passwords to see the cross-field check: the message
 * is attached to `confirmPassword` via the schema's `path`, not raised at the
 * form level where it would have nowhere to render.
 */
export const Default: Story = {
  args: {},
}

export const WithProviders: Story = {
  args: {
    providers: [
      { id: "github", label: "GitHub" },
      { id: "google", label: "Google" },
    ],
  },
}

export const Pending: Story = {
  args: {
    pending: true,
  },
}

export const ServerError: Story = {
  args: {
    error: "That email is already registered.",
  },
}

/** The terms wording is a prop, so the links stay the host app's to route. */
export const CustomTerms: Story = {
  args: {
    termsLabel: "I accept the acceptable use policy and data agreement",
  },
}

const meta: Meta = {
  title: "UI/Auth/Components/SignUpForm",
  component: SignUpForm,
  tags: ["autodocs"],
  argTypes: {
    onSubmit: { action: "sign-up submitted" },
    onProviderSelect: { action: "provider selected" },
  },
  decorators: [
    (Story) => (
      <AuthCard title="Create account" description="Get started.">
        <Story />
      </AuthCard>
    ),
  ],
}

export default meta
