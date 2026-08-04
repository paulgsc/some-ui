import type { FC } from "react"
import { Button } from "@some-ui/shared"

import type { OAuthProvider } from "../../types/auth"

export type AuthDividerProps = {
  label?: string
}

/** Rule with centred text, for the gap between third-party and credentials. */
export const AuthDivider: FC<AuthDividerProps> = ({ label = "or" }) => (
  <div className="flex items-center gap-3">
    <span className="bg-border h-px flex-1" />
    <span className="text-muted-foreground text-xs uppercase tracking-wide">
      {label}
    </span>
    <span className="bg-border h-px flex-1" />
  </div>
)

export type OAuthButtonsProps = {
  providers: ReadonlyArray<OAuthProvider>
  /** Receives `provider.id`. The caller starts the redirect or popup. */
  onSelect: (providerId: string) => void
  disabled?: boolean
}

/**
 * Third-party sign-in buttons, rendered from a caller-supplied list.
 *
 * The providers are data, not hardcoded cases, because which ones exist is a
 * server-side configuration question — this package would otherwise need a
 * release every time one is enabled. Provider marks arrive the same way, as
 * `provider.icon`, so no brand SVGs ship in this bundle.
 *
 * `onSelect` gets an id and nothing else. Starting an OAuth handshake means
 * building a state parameter, a PKCE verifier and a redirect the backend
 * controls; the button's job ends at "the user picked GitHub".
 */
export const OAuthButtons: FC<OAuthButtonsProps> = ({
  providers,
  onSelect,
  disabled = false,
}) => {
  if (providers.length === 0) return null

  return (
    <div className="grid gap-2">
      {providers.map((provider) => (
        <Button
          key={provider.id}
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => onSelect(provider.id)}
          className="w-full"
        >
          {provider.icon ? (
            <span className="mr-2 inline-flex size-4 items-center justify-center">
              {provider.icon}
            </span>
          ) : null}
          Continue with {provider.label}
        </Button>
      ))}
    </div>
  )
}
