import { AuthCard } from "@auth/components/auth-card"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { SignInForm } from "."

type Story = StoryObj<typeof SignInForm>
type Meta = MetaObj<typeof SignInForm>

/** Submitting with an empty or malformed email shows the zod messages. */
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

export const WithPasskey: Story = {
  args: {
    onPasskeySignIn: () => undefined,
  },
}

export const PasskeyFirst: Story = {
  args: {
    onPasskeySignIn: () => undefined,
    passkeyFirst: true,
    providers: [
      { id: "github", label: "GitHub" },
      { id: "google", label: "Google" },
    ],
    onProviderSelect: () => undefined,
  },
}

/** The whole form is disabled and the button spins while the request is out. */
export const Pending: Story = {
  args: {
    pending: true,
    defaultEmail: "you@example.com",
  },
}

/**
 * The server-side failure path. The message is deliberately vague about which
 * half was wrong — a precise one would let an attacker enumerate accounts.
 */
export const ServerError: Story = {
  args: {
    defaultEmail: "you@example.com",
    error: "Email or password is incorrect.",
  },
}

/** Omitting `onForgotPassword` removes the link, for deployments with no reset. */
export const NoResetFlow: Story = {
  args: {
    onForgotPassword: undefined,
  },
}

const meta: Meta = {
  title: "UI/Auth/Components/SignInForm",
  component: SignInForm,
  tags: ["autodocs"],
  args: {
    onForgotPassword: () => undefined,
  },
  argTypes: {
    onSubmit: { action: "sign-in submitted" },
    onProviderSelect: { action: "provider selected" },
    onPasskeySignIn: { action: "passkey selected" },
  },
  decorators: [
    (Story) => (
      <AuthCard title="Sign in" description="Welcome back.">
        <Story />
      </AuthCard>
    ),
  ],
}

export default meta
