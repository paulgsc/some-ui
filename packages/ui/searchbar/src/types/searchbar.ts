import type { ReactNode } from "react"

import { createEnumSchema } from "./auth/roles"

export type SearchContext = "navigation" | "blog" | "events" | "updates"
export type SearchContextMenu = {
  default: SearchContext
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
