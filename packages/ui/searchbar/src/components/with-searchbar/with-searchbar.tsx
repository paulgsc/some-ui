import { Fragment, type FC } from "react"

import type { SeachBarNode, SearchBarRenderType } from "@/types/searchbar"

import SearchBarForm from "./search-bar-form"

const searchBarComponent: SeachBarNode = {
  fragment: <Fragment />,
  searchbar: <SearchBarForm />,
}

type WithSearchBarProps = {
  showSearch: SearchBarRenderType
}
const WithSearchBar: FC<WithSearchBarProps> = ({ showSearch }) => {
  return searchBarComponent[showSearch]
}

export default WithSearchBar
