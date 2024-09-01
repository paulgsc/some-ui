import { Button } from "@/components/ui/button"
import { Icons } from "@/components/icons"

import { CloseSearchBarBtn } from "./close-searchbar"
import SearchBarContextMenu from "./search-context-menu"

const SearchBarForm = () => {
  return (
    <form
      role="search"
      className="bg-primary-foreground hidden h-14 flex-1 items-center rounded-full lg:flex"
    >
      <section className="relative size-full">
        <CloseSearchBarBtn role="status">
          <Icons.cross className="text-muted-foreground size-3 shrink-0 transition-transform hover:scale-105 hover:text-pink-500" />
        </CloseSearchBarBtn>
        <input
          type="text"
          className="bg-card size-full rounded-l-full p-2.5 ps-10 text-sm text-gray-900 outline-none focus:ring-1 dark:text-white"
          placeholder="Search"
          required
        />
        <Button
          type="submit"
          variant={"ghost"}
          className="absolute inset-y-0 end-0 flex size-fit h-full items-center rounded-none border-none p-0 px-6"
        >
          <Icons.magnifyGlass className="size-4" />
        </Button>
      </section>
      <SearchBarContextMenu />
    </form>
  )
}

export default SearchBarForm
