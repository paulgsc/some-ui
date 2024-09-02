import { forwardRef } from "react"
import { useSearchBarState } from "@searchbar/hooks"
import type { SearchBarRenderType } from "@searchbar/types"
import { Button, type ButtonProps } from "some-ui-shared"
import { cn, type QueryStateOptions } from "some-ui-utils"

import { defaultSearchToggleContextConfig } from "../data"

type CloseSearchBarBtnProps<T extends SearchBarRenderType> = {
  config?: QueryStateOptions<T>
  param: string
} & ButtonProps

const CloseSearchBarBtn = forwardRef<
  HTMLButtonElement,
  CloseSearchBarBtnProps<SearchBarRenderType>
>(({ className, config, param, ...props }, ref) => {
  const { setContext } = useSearchBarState({
    config: { ...defaultSearchToggleContextConfig, ...config },
    param: param,
  })

  return (
    <Button
      ref={ref}
      onClick={() => {
        void setContext("fragment")
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
