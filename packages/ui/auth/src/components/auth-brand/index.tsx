import type { FC } from "react"
import { cn } from "@some-ui/core-utils"
import { BrandMark } from "@some-ui/shared"

export type AuthBrandProps = {
  name?: string
  className?: string
  markClassName?: string
}

/** The Some UI wordmark: the mochi mark in the session theme's `--brand`, and the name. */
export const AuthBrand: FC<AuthBrandProps> = ({
  name = "Some UI",
  className,
  markClassName,
}) => (
  <div
    className={cn(
      "text-foreground inline-flex items-center gap-2 font-semibold",
      className
    )}
  >
    <BrandMark tone="brand" className={cn("size-8", markClassName)} />
    <span>{name}</span>
  </div>
)
