import type { FC, ReactNode } from "react"
import { cn } from "@some-ui/core-utils"
import { Alert, AlertDescription, AlertTitle } from "@some-ui/shared"
import { Info } from "lucide-react"

import { AuthBrand } from "../../components/auth-brand"
import { AuthFlow } from "../../components/auth-flow"
import type { AuthFlowProps } from "../../components/auth-flow"

export type AuthPageTemplateProps = AuthFlowProps & {
  /** Product mark or wordmark; intentionally supplied by the host app. */
  brand?: ReactNode
  /** Optional marketing, illustration, or trust content for wide screens. */
  aside?: ReactNode
  /** Consumer-owned copy rendered in the template's structured split panel. */
  welcome?: {
    eyebrow?: ReactNode
    title: ReactNode
    description?: ReactNode
  }
  /** A compact disclosure pinned to the split panel's top-right corner. */
  notice?: {
    title: ReactNode
    description?: ReactNode
  }
  footer?: ReactNode
  className?: string
}

/**
 * Copy-friendly, shadcn-style page composition for the complete auth flow.
 * It only forwards props: routing, WebAuthn, and server calls belong to the
 * host application's adapter.
 *
 * Governing rule: Mobile defines the auth experience; desktop decorates it.
 * Below the `lg` breakpoint, the marketing/welcome panel is hidden entirely,
 * rendering a single compact auth page (brand → form → footer).
 */
export const AuthPageTemplate: FC<AuthPageTemplateProps> = ({
  brand = <AuthBrand />,
  aside,
  welcome,
  notice,
  footer,
  className,
  passkeyAvailable = true,
  passkeyFirst = true,
  ...flowProps
}) => {
  const hasAside = Boolean(aside || welcome)

  return (
    <main
      className={cn(
        "some-ui-auth-page bg-background text-foreground min-h-dvh font-sans",
        hasAside && "lg:grid lg:grid-cols-2",
        className
      )}
    >
      {hasAside ? (
        <aside className="some-ui-auth-page__aside relative hidden min-h-dvh flex-col overflow-hidden border-r p-10 lg:flex">
          {brand ? <div className="relative z-10">{brand}</div> : null}

          {notice ? (
            <Alert className="absolute top-10 right-10 z-10 max-w-xs">
              <Info aria-hidden="true" />
              <AlertTitle>{notice.title}</AlertTitle>
              {notice.description ? (
                <AlertDescription>{notice.description}</AlertDescription>
              ) : null}
            </Alert>
          ) : null}

          <div className="relative z-10 flex flex-1 items-center">
            {welcome ? (
              <div className="max-w-md space-y-3">
                {welcome.eyebrow ? (
                  <p className="text-primary text-sm font-semibold tracking-wide uppercase">
                    {welcome.eyebrow}
                  </p>
                ) : null}

                <h1 className="text-4xl font-bold tracking-tight text-balance">
                  {welcome.title}
                </h1>

                {welcome.description ? (
                  <p className="text-muted-foreground max-w-sm leading-relaxed text-balance">
                    {welcome.description}
                  </p>
                ) : null}
              </div>
            ) : (
              aside
            )}
          </div>
        </aside>
      ) : null}

      <section className="flex min-h-dvh flex-col px-6 py-6 sm:px-8 lg:p-10">
        <header className={cn(hasAside && "lg:hidden")}>{brand}</header>

        <div className="min-h-0 flex flex-1 items-center justify-center py-8">
          <AuthFlow
            {...flowProps}
            passkeyAvailable={passkeyAvailable}
            passkeyFirst={passkeyFirst}
          />
        </div>

        {footer ? (
          <footer className="text-muted-foreground text-center text-xs">
            {footer}
          </footer>
        ) : null}
      </section>
    </main>
  )
}
