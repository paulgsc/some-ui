import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { AuthGate } from "."

type Story = StoryObj<typeof AuthGate>
type Meta = MetaObj<typeof AuthGate>

const GatedContent = (
  <div className="rounded-lg border p-4">
    <p className="text-sm font-medium">Dashboard</p>
    <p className="text-muted-foreground text-sm">
      Everything behind the gate. Each request this makes is still authorized by
      the server on its own — the gate is presentation, not enforcement.
    </p>
  </div>
)

const SignInFallback = (
  <div className="rounded-lg border p-4">
    <p className="text-sm font-medium">Sign in to continue</p>
    <p className="text-muted-foreground text-sm">The sign-in flow goes here.</p>
  </div>
)

export const Authenticated: Story = {
  args: {
    status: "authenticated",
    children: GatedContent,
    fallback: SignInFallback,
  },
}

export const Unauthenticated: Story = {
  args: {
    status: "unauthenticated",
    children: GatedContent,
    fallback: SignInFallback,
  },
}

/**
 * First paint, before the session endpoint has answered. This state exists
 * separately from `unauthenticated` precisely so a reload of a signed-in
 * session does not flash the sign-in screen for a frame.
 */
export const Unknown: Story = {
  args: {
    status: "unknown",
    children: GatedContent,
    fallback: SignInFallback,
  },
}

export const CustomPending: Story = {
  args: {
    status: "unknown",
    children: GatedContent,
    fallback: SignInFallback,
    pending: (
      <p className="text-muted-foreground text-sm">Checking your session…</p>
    ),
  },
}

const meta: Meta = {
  title: "UI/Auth/Components/AuthGate",
  component: AuthGate,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
}

export default meta
