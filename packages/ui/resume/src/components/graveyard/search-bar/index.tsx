import { Search } from "lucide-react"
import { Input } from "some-ui-shared"

type SearchBarProps = {
  searchQuery: string
  setSearchQuery: (query: string) => void
}

export const SearchBar = ({ searchQuery, setSearchQuery }: SearchBarProps) => {
  return (
    <div className="relative w-64">
      <Search className="text-muted-foreground absolute left-2 top-2.5 size-4" />
      <Input
        placeholder="Search packages..."
        className="pl-8"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
    </div>
  )
}
