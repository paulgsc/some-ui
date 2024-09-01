import { parseAsStringLiteral, useQueryState } from "nuqs"

// Replace with the actual import path

type QueryStateOptions = {
  defaultValue: string
  validValues: Array<string>
  options?: {
    clearOnDefault?: boolean
  }
}

type QueryStateReturnType = ReturnType<typeof useQueryState>

export function useStringQueryState(
  key: string,
  config: QueryStateOptions
): QueryStateReturnType {
  const { defaultValue, validValues, options } = config

  const [value, setValue] = useQueryState(
    key,
    parseAsStringLiteral(validValues)
      .withDefault(defaultValue)
      .withOptions({ ...options })
  )

  return [value, setValue] as const
}
