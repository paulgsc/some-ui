import type { FC, ReactNode } from "react"
import { cn } from "@some-ui/core-utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@some-ui/shared"

export type AuthCardProps = {
  title: string
  description?: ReactNode
  children: ReactNode
  /** Cross-links out of this step — "Don't have an account? Sign up". */
  footer?: ReactNode
  className?: string
}

/**
 * The shell every step in this package renders into.
 *
 * Fixed at `max-w-sm` on purpose: an auth form is one column of short fields,
 * and letting it grow to the container's width produces the stretched inputs
 * that make a sign-in page look like a settings page. The width is overridable
 * via `className` for callers embedding this in a split-screen layout.
 */
export const AuthCard: FC<AuthCardProps> = ({
  title,
  description,
  children,
  footer,
  className,
}) => (
  <Card className={cn("w-full max-w-sm", className)}>
    <CardHeader className="space-y-1">
      <CardTitle className="text-xl">{title}</CardTitle>
      {description ? <CardDescription>{description}</CardDescription> : null}
    </CardHeader>
    <CardContent className="space-y-4">{children}</CardContent>
    {footer ? (
      <CardFooter className="text-muted-foreground justify-center text-sm">
        {footer}
      </CardFooter>
    ) : null}
  </Card>
)
