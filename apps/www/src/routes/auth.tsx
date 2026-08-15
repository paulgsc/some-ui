import type { JSX } from "react"
import { AuthPageTemplate } from "@some-ui/auth"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { createDecorativeSession } from "@/lib/auth-session"

type AuthSearch = { redirect?: string }

function validateSearch(search: Record<string, unknown>): AuthSearch {
  return typeof search.redirect === "string" &&
    search.redirect.startsWith("/") &&
    !search.redirect.startsWith("//") &&
    search.redirect !== "/auth"
    ? { redirect: search.redirect }
    : {}
}

const noop = (): void => undefined

const AuthPage = (): JSX.Element => {
  const { redirect = "/app" } = Route.useSearch()
  const navigate = useNavigate()

  const continueWithPasskey = (): void => {
    createDecorativeSession()
    void navigate({ href: redirect })
  }

  return (
    <AuthPageTemplate
      step="sign-in"
      onStepChange={noop}
      onSignIn={noop}
      onSignUp={noop}
      onRequestReset={noop}
      onResetPassword={noop}
      onVerifyCode={noop}
      onPasskeySignIn={continueWithPasskey}
      passkeyAvailable
      passkeyFirst
      passkeyOnly
      productName="Some UI"
      welcome={{
        eyebrow: "Welcome back",
        title: "Ready for another learning session?",
        description:
          "Continue with your passkey to pick up where you left off.",
      }}
      notice={{
        title: "Preview only",
        description:
          "Passkey sign-in is a no-op until backend authentication is connected.",
      }}
    />
  )
}

export const Route = createFileRoute("/auth")({
  validateSearch,
  component: AuthPage,
})
