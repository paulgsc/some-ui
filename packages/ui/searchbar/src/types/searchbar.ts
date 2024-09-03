import type { Dispatch, ReactNode, SetStateAction } from "react"
import { createEnumSchema } from "some-types-utils"
import type { ButtonProps } from "some-ui-shared"
import type { QueryStateOptions, useStringQueryState } from "some-ui-utils"

export type SearchContext = "navigation" | "blog" | "events" | "updates"
export type SearchContextMenu = {
  defaultValue: SearchContext
  menu: Array<SearchContext>
}

export type SearchbarToggleContextMenu = {
  defaultValue: SearchBarRenderType
  menu: Array<SearchBarRenderType>
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

export type QueryStateReturnType<T extends string> = ReturnType<
  typeof useStringQueryState<T>
>

export type UseSearchBarStateReturn<T extends string> = {
  context: T
  setContext:
    | QueryStateReturnType<T>[1]
    | React.Dispatch<React.SetStateAction<T>>
  menuItems: Array<T>
}

export type UseSearchBarStateProps<T extends string> = {
  config: QueryStateOptions<T>
  param?: string
}

export type CloseSearchBarBtnProps = {
  setContext:
    | QueryStateReturnType<SearchBarRenderType>[1]
    | Dispatch<SetStateAction<SearchBarRenderType>>
} & ButtonProps
