import { forwardRef, type HTMLAttributes } from "react"
import { parseAsStringLiteral, useQueryState } from "nuqs"

import type { SearchBarRenderType } from "@/types/searchbar"
import { cn } from "@/lib/utils"

const CloseSearchBarBtn = forwardRef<
  HTMLButtonElement,
  HTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => {
  const sortOrder: Array<SearchBarRenderType> = [
    "fragment",
    "searchbar",
  ] as const

  const [_, setShowSearch] = useQueryState(
    "seshow",
    parseAsStringLiteral(sortOrder)
      .withDefault("fragment")
      .withOptions({ clearOnDefault: true })
  )

  return (
    <button
      ref={ref}
      onClick={() => {
        setShowSearch("fragment")
      }}
      className={cn(
        "absolute inset-y-0 start-0 z-10 flex items-center ps-3",
        className
      )}
      {...props}
    />
  )
})
CloseSearchBarBtn.displayName = "CloseSearchBarBtn"

export { CloseSearchBarBtn }
