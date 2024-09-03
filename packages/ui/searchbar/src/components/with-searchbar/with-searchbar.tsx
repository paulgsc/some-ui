import { Fragment, type FC } from "react"
import SearchBarForm from "@searchbar/components/searchbar-form/searchbar-form"
import type { SeachBarNode, SearchBarRenderType } from "@searchbar/types"

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
