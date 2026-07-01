import type { FC } from "react"
import { defaultSearchToggleContextConfig } from "@searchbar/components/data"
import { WithSearchbar } from "@searchbar/components/with-searchbar"
import { useSearchbarUrlState } from "@searchbar/hooks/use-searchbar-state"
import type { SearchBarKeyBinding, SearchBarRenderType } from "@searchbar/types"
import { ASCII, createKeyBindingImpl } from "@searchbar/types"
import { useEventListener, type QueryStateOptions } from "some-ui-utils"

type SearchBarProps = {
  config?: QueryStateOptions<SearchBarRenderType>
  param: string
}

const SearchBar: FC<SearchBarProps> = ({ config, param }) => {
  const { context, setContext } = useSearchbarUrlState({
    config: { ...defaultSearchToggleContextConfig, ...config },
    param: param,
  })

  const slashKeyBinding = createKeyBindingImpl<
    SearchBarKeyBinding["keyBinding"],
    SearchBarKeyBinding["eventName"]
  >({
    apply: (event) => {
      event.preventDefault()
      void setContext("searchbar")
    },
    eventName: "keydown",
    keyBinding: ASCII.SLASH,
    isActive: (event, keyBinding) =>
      event.key.charCodeAt(0) === keyBinding && !event.repeat,
  })

  useEventListener(slashKeyBinding.eventName, (event: KeyboardEvent) => {
    if (slashKeyBinding.isActive?.(event, slashKeyBinding.keyBinding)) {
      switch (context) {
        case "fragment": {
          slashKeyBinding.apply(event)
          break
        }
        case "searchbar":
          break
        default:
          context satisfies never
          return
      }
    }
  })
  return <WithSearchbar showSearch={context} />
}

export default SearchBar
