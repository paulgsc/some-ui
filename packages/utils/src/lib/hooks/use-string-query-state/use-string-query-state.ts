import { parseAsStringLiteral, useQueryState } from "nuqs"

// Replace with the actual import path

export type QueryStateOptions = {
  defaultValue: string
  menu: Array<string>
  options?: {
    clearOnDefault?: boolean
  }
}

type QueryStateReturnType = ReturnType<typeof useQueryState>

export function useStringQueryState(
  key: string,
  config: QueryStateOptions
): QueryStateReturnType {
  const { defaultValue, menu, options } = config

  const [value, setValue] = useQueryState(
    key,
    parseAsStringLiteral(menu)
      .withDefault(defaultValue)
      .withOptions({ ...options })
  )

  return [value, setValue] as const
}
