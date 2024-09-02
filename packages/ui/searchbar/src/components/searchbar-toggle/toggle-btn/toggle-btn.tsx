import { forwardRef } from "react"
import { Button, type ButtonProps } from "some-ui-shared"
import { cn } from "some-ui-utils"

const CloseSearchBarBtn = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        variant={variant}
        className={cn(
          "absolute inset-y-0 start-0 z-10 flex items-center ps-3",
          className
        )}
        {...props}
      />
    )
  }
)
CloseSearchBarBtn.displayName = "CloseSearchBarBtn"

export { CloseSearchBarBtn }
