import { forwardRef } from "react"
import { useSearchBarState } from "@searchbar/hooks"
import type { SearchBarRenderType } from "@searchbar/types"
import type { ButtonProps } from "some-ui-shared"
import { type QueryStateOptions } from "some-ui-utils"

import { defaultSearchToggleContextConfig } from "../data"
import { CloseSearchBarBtn } from "./toggle-btn"

type SearchBarToggleProps = {
  config?: QueryStateOptions<SearchBarRenderType>
  param: string
} & ButtonProps

const SearchBarToggle = forwardRef<HTMLButtonElement, SearchBarToggleProps>(
  ({ className, config, param, ...props }, ref) => {
    const { setContext } = useSearchBarState({
      config: { ...defaultSearchToggleContextConfig, ...config },
      param: param,
    })

    return (
      <CloseSearchBarBtn
        ref={ref}
        onClick={() => {
          void setContext("fragment")
        }}
        className={className}
        {...props}
      />
    )
  }
)
SearchBarToggle.displayName = "SearchBarToggle"

export { SearchBarToggle }
