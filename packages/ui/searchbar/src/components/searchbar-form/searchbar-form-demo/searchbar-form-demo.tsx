import SearchBarContextMenuDemo from "@searchbar/components/searchbar-menu/demo/searchbar-menu-demo"
import SearchBarToggleDemo from "@searchbar/components/searchbar-toggle/demo/searchbar-toggle-btn-demo"
import { Button, SvgIcons } from "some-ui-shared"

const SearchBarFormDemo = (): JSX.Element => {
  return (
    <form
      role="search"
      className="hidden h-14 flex-1 items-center rounded-full bg-primary-foreground lg:flex"
    >
      <section className="relative size-full">
        <SearchBarToggleDemo role="status">
          <SvgIcons.cross className="size-3 shrink-0 text-muted-foreground transition-transform hover:scale-105 hover:text-pink-500" />
        </SearchBarToggleDemo>
        <input
          type="text"
          className="size-full rounded-l-full bg-card p-2.5 ps-10 text-sm text-gray-900 outline-none focus:ring-1 dark:text-white"
          placeholder="Search"
          required
        />
        <Button
          type="submit"
          variant={"ghost"}
          className="absolute inset-y-0 end-0 flex size-fit h-full items-center rounded-none border-none p-0 px-6"
        >
          <SvgIcons.magnifyGlass className="size-4" />
        </Button>
      </section>
      <SearchBarContextMenuDemo />
    </form>
  )
}

export default SearchBarFormDemo
