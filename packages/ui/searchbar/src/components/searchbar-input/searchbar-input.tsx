import type { FC } from "react"
import { Input } from "some-ui-shared"
import { cn } from "some-ui-utils"

type SearchbarInputProps = {
  placeholder?: string
  className?: string
}
const SearchbarInput: FC<SearchbarInputProps> = ({
  placeholder = "Search",
  className,
}) => {
  return (
    <Input
      type="search"
      placeholder={placeholder}
      required
      className={cn(
        "size-full rounded-l-full bg-card p-2.5 ps-10 text-sm text-gray-900 outline-none focus:ring-1 dark:text-white",
        className
      )}
    />
  )
}

export { SearchbarInput }
