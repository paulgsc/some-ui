import { SearchBarContextMenu } from "@searchbar/components/searchbar-menu"
import { SearchBarToggle } from "@searchbar/components/searchbar-toggle"
import { Button, SvgIcons } from "some-ui-shared"

const SearchBarForm = (): JSX.Element => {
  return (
    <form
      role="search"
      className="hidden h-14 flex-1 items-center rounded-full bg-primary-foreground lg:flex"
    >
      <section className="relative size-full">
        <SearchBarToggle param="foo" role="status">
          <SvgIcons.cross className="size-3 shrink-0 text-muted-foreground transition-transform hover:scale-105 hover:text-pink-500" />
        </SearchBarToggle>
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
      <SearchBarContextMenu param="foo" />
    </form>
  )
}

export default SearchBarForm
