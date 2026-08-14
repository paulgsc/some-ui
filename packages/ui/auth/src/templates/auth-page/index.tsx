import type { FC, ReactNode } from "react"
import { cn } from "@some-ui/core-utils"

import { AuthBrand } from "../../components/auth-brand"
import { AuthFlow } from "../../components/auth-flow"
import type { AuthFlowProps } from "../../components/auth-flow"

export type AuthPageTemplateProps = AuthFlowProps & {
  /** Product mark or wordmark; intentionally supplied by the host app. */
  brand?: ReactNode
  /** Optional marketing, illustration, or trust content for wide screens. */
  aside?: ReactNode
  footer?: ReactNode
  className?: string
}

/**
 * Copy-friendly, shadcn-style page composition for the complete auth flow.
 * It only forwards props: routing, WebAuthn, and server calls belong to the
 * host application's adapter.
 */
export const AuthPageTemplate: FC<AuthPageTemplateProps> = ({
  brand = <AuthBrand />,
  aside,
  footer,
  className,
  passkeyAvailable = true,
  passkeyFirst = true,
  ...flowProps
}) => (
  <main
    className={cn(
      "some-ui-auth-page bg-background text-foreground grid min-h-screen font-sans lg:grid-cols-2",
      !aside && "lg:grid-cols-1",
      className
    )}
  >
    {aside ? (
      <aside className="some-ui-auth-page__aside relative hidden overflow-hidden border-r p-10 lg:flex lg:flex-col">
        {brand ? <div className="relative z-10">{brand}</div> : null}
        <div className="relative z-10 mt-auto">{aside}</div>
      </aside>
    ) : null}
    <section className="flex min-h-screen flex-col p-6 md:p-10">
      {!aside && brand ? <header>{brand}</header> : null}
      <div className="flex flex-1 items-center justify-center py-10">
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
