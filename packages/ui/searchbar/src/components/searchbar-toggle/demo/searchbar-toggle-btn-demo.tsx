import { forwardRef } from "react"
import { defaultSearchToggleContextConfig } from "@searchbar/components/data"
import { CloseSearchBarBtn } from "@searchbar/components/searchbar-toggle"
import { useFallbackState } from "@searchbar/hooks/storybook"
import type { SearchBarRenderType } from "@searchbar/types"
import type { ButtonProps } from "some-ui-shared"
import { type QueryStateOptions } from "some-ui-utils"

type SearchBarToggleDemoProps = {
  config?: QueryStateOptions<SearchBarRenderType>
} & ButtonProps

const SearchBarToggleDemo = forwardRef<
  HTMLButtonElement,
  SearchBarToggleDemoProps
>(({ className, config, ...props }, ref) => {
  const { setContext } = useFallbackState({
    ...defaultSearchToggleContextConfig,
    ...config,
  })
  return (
    <CloseSearchBarBtn
      ref={ref}
      className={className}
      onClick={() => {
        void setContext("fragment")
      }}
      {...props}
    />
  )
})
SearchBarToggleDemo.displayName = "SearchBarToggle"

export default SearchBarToggleDemo
