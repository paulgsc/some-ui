import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "some-ui-shared"
import { QueryStateOptions, useStringQueryState } from "some-ui-utils"

const SearchBarContextMenu = () => {
  const config: QueryStateOptions = {
    defaultValue: "foo",
    validValues: ["foo", "bar"],
    options: {
      clearOnDefault: true,
    },
  }
  const [urlContext, setUrlContext] = useStringQueryState("t", config)

  return (
    <Select
      onValueChange={(value) => setUrlContext(value)}
      defaultValue={"foo"}
    >
      <SelectTrigger className="bg-primary-foreground h-full max-w-32 rounded-none rounded-r-full capitalize outline-none ring-0 ring-offset-0 focus:outline-none focus:ring-0 focus:ring-offset-0">
        <SelectValue placeholder={"foo"} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup defaultValue={"foo"}>
          {config.validValues.map((menu) => (
            <SelectItem
              key={menu}
              value={menu}
              className="shrink-0 text-sm tracking-tight"
            >
              {menu}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export default SearchBarContextMenu
