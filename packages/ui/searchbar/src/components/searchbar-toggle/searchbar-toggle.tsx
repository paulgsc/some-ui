import { forwardRef } from "react"
import { Button, ButtonProps } from "some-ui-shared"
import { cn } from "some-ui-utils"

const CloseSearchBarBtn = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => {
    // const sortOrder: Array<SearchBarRenderType> = [
    //   "fragment",
    //   "searchbar",
    // ] as const

    // const [_, setShowSearch] = useQueryState(
    //   "seshow",
    //   parseAsStringLiteral(sortOrder)
    //     .withDefault("fragment")
    //     .withOptions({ clearOnDefault: true })
    // )

    return (
      <Button
        ref={ref}
        onClick={() => {
          // setShowSearch("fragment")
        }}
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
