import type { FC, ReactNode } from "react"
import { AuthBrand } from "@auth/components/auth-brand"
import { AuthFlow } from "@auth/components/auth-flow"
import type { AuthFlowProps } from "@auth/components/auth-flow"
import { cn } from "@some-ui/core-utils"
import { Alert, AlertDescription, AlertTitle } from "@some-ui/shared"
import { Info } from "lucide-react"

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
}) => (
  <main
    className={cn(
      "some-ui-auth-page bg-background text-foreground grid min-h-screen font-sans lg:grid-cols-2",
      !aside && !welcome && "lg:grid-cols-1",
      className
    )}
  >
    {aside || welcome ? (
      <aside className="some-ui-auth-page__aside relative flex flex-col overflow-hidden border-b p-6 lg:min-h-screen lg:border-r lg:border-b-0 lg:p-10">
        {brand ? <div className="relative z-10">{brand}</div> : null}
        {notice ? (
          <Alert className="relative z-10 mt-6 max-w-xs self-end lg:absolute lg:top-10 lg:right-10 lg:mt-0">
            <Info aria-hidden="true" />
            <AlertTitle>{notice.title}</AlertTitle>
            {notice.description ? (
              <AlertDescription>{notice.description}</AlertDescription>
            ) : null}
          </Alert>
        ) : null}
        <div className="relative z-10 my-12 flex flex-1 items-center lg:my-20">
          {welcome ? (
            <div className="max-w-md space-y-3">
              {welcome.eyebrow ? (
                <p className="text-primary text-sm font-semibold tracking-wide uppercase">
                  {welcome.eyebrow}
                </p>
              ) : null}
              <h1 className="text-3xl font-bold text-balance tracking-tight lg:text-4xl">
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
    <section className="flex min-h-screen flex-col p-6 md:p-10">
      {!aside && !welcome && brand ? <header>{brand}</header> : null}
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
