import type { JSX } from "react"
import { AuthPageTemplate } from "@some-ui/auth"
import { Alert, AlertDescription, AlertTitle } from "@some-ui/shared"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Info } from "lucide-react"

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
      aside={
        <div className="max-w-xl space-y-6">
          <div className="space-y-3">
            <p className="text-primary text-sm font-semibold tracking-wide uppercase">
              Welcome back
            </p>
            <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">
              Your next learning session is ready when you are.
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed">
              Continue with a passkey to return to your sessions, preferences,
              and learning progress in Some UI.
            </p>
          </div>
          <Alert className="max-w-xl">
            <Info aria-hidden="true" />
            <AlertTitle>This sign-in is a preview</AlertTitle>
            <AlertDescription>
              Authentication is not connected yet. The passkey button is a no-op
              that only unlocks this decorative browser session—no credential is
              created or checked.
            </AlertDescription>
          </Alert>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Preview note: access lasts only for this page session. Refreshing
            starts the decorative sign-in flow again while backend
            authentication is being built.
          </p>
        </div>
      }
    />
  )
}

export const Route = createFileRoute("/auth")({
  validateSearch,
  component: AuthPage,
})
