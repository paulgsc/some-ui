import type { ReactNode } from "react"
import { createEnumSchema } from "some-types-utils"
import type { QueryStateOptions, useStringQueryState } from "some-ui-utils"

export type SearchContext = "navigation" | "blog" | "events" | "updates"
export type SearchContextMenu = {
  defaultValue: SearchContext
  menu: Array<SearchContext>
}

export type SearchBarRenderType = "fragment" | "searchbar"

export type SeachBarNode = Record<SearchBarRenderType, ReactNode>

export const searchContextSchema = createEnumSchema<SearchContext>([
  "blog",
  "events",
  "navigation",
  "updates",
])

export const searchBarRenderSchema = createEnumSchema<SearchBarRenderType>([
  "fragment",
  "searchbar",
])

export type QueryStateReturnType = ReturnType<typeof useStringQueryState>

export type UseSearchBarStateReturn = {
  context: string
  setContext: QueryStateReturnType[1]
  menuItems: Array<string>
}

export type UseSearchBarStateProps<T extends string> = {
  config: QueryStateOptions
  param: T
}
