import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { AuthError } from "."

type Story = StoryObj<typeof AuthError>
type Meta = MetaObj<typeof AuthError>

/**
 * The wording a sign-in failure should use: it does not say whether the email
 * exists, because saying so turns the form into an account-enumeration oracle.
 */
export const SignInFailure: Story = {
  args: {
    title: "Could not sign in",
    message: "Email or password is incorrect.",
  },
}

export const RateLimited: Story = {
  args: {
    title: "Too many attempts",
    message: "Try again in a few minutes, or reset your password.",
  },
}

/** No message means no banner — the component renders nothing at all. */
export const Empty: Story = {
  args: {
    message: null,
  },
}

const meta: Meta = {
  title: "UI/Auth/Components/AuthError",
  component: AuthError,
  tags: ["autodocs"],
}

export default meta
