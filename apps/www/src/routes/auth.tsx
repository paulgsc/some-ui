import type { JSX } from "react"
import { AuthBrand, AuthPageTemplate } from "@some-ui/auth"
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
      brand={
        <div className="space-y-4">
          <AuthBrand />
          <Alert className="max-w-xl">
            <Info aria-hidden="true" />
            <AlertTitle>Decorative authentication only</AlertTitle>
            <AlertDescription>
              Passkey sign-in is currently a no-op. Continuing only unlocks this
              static browser session; no credential is created or checked.
            </AlertDescription>
          </Alert>
        </div>
      }
      footer="Passkey support is a preview while backend authentication is being built."
    />
  )
}

export const Route = createFileRoute("/auth")({
  validateSearch,
  component: AuthPage,
})
