import type { JSX } from "react"
import { SearchBar } from "@resume/components/graveyard/search-bar"
import { SortButton } from "@resume/components/graveyard/sort-button"
import { Flower } from "lucide-react"

type HeaderProps = {
  searchQuery: string
  setSearchQuery: (query: string) => void
  sortBy: "lastActivity" | "name"
  setSortBy: (sortBy: "lastActivity" | "name") => void
}

export const Header = ({
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
}: HeaderProps): JSX.Element => {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Flower className="size-6 text-emerald-500" />
        Package Garden
      </h1>
      <div className="flex items-center gap-2">
        <SearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
        <SortButton sortBy={sortBy} setSortBy={setSortBy} />
      </div>
    </div>
  )
}
