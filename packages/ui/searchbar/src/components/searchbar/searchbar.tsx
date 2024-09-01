"use client"

import { searchBarRenderSchema, type SearchBarRenderType } from "@/types"
import { parseAsStringLiteral, useQueryState } from "nuqs"

import { type SearchBarKeyBinding } from "@/types/key-bindings/key-traits-utilities"
import { ASCII } from "@/types/key-bindings/keys"
import { createKeyBindingImpl } from "@/lib/key-bindings"
import { useEventListener } from "@/hooks/useEventListener"

import WithSearchBar from "./with-search-bar"

// @todo maybe make it animate?
const SearchBarResponsive = () => {
  const sortOrder: Array<SearchBarRenderType> = [
    "fragment",
    "searchbar",
  ] as const
  const [showSearch, setShowSearch] = useQueryState(
    "seshow",
    parseAsStringLiteral(sortOrder).withDefault("fragment")
  )

  const contextFromParam =
    searchBarRenderSchema.safeParse(showSearch).data ?? "fragment"

  const slashKeyBinding = createKeyBindingImpl<
    SearchBarKeyBinding["keyBinding"],
    SearchBarKeyBinding["eventName"]
  >({
    apply: (event) => {
      event.preventDefault()
      setShowSearch("searchbar")
    },
    eventName: "keydown",
    keyBinding: ASCII.SLASH,
    isActive: (event, keyBinding) =>
      event.key.charCodeAt(0) === keyBinding && !event.repeat,
  })

  useEventListener(slashKeyBinding.eventName, (event: KeyboardEvent) => {
    if (slashKeyBinding.isActive?.(event, slashKeyBinding.keyBinding)) {
      switch (contextFromParam) {
        case "fragment": {
          slashKeyBinding.apply(event)
          break
        }
        case "searchbar":
          break
        default:
          contextFromParam satisfies never
          return
      }
    }
  })
  return <WithSearchBar showSearch={contextFromParam} />
}

export default SearchBarResponsive
