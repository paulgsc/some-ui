import { parseAsStringLiteral, useQueryState } from "nuqs"

// Replace with the actual import path

export type QueryStateOptions<T extends string> = {
  defaultValue: T
  menu: Array<T>
  options?: {
    clearOnDefault?: boolean
  }
}

type UseQueryStateReturnType<T> = [
  value: T | null,
  setValue: (
    value: T | ((old: T | null) => T | null) | null,
    options?: { clearOnDefault?: boolean }
  ) => Promise<URLSearchParams>,
]

export function useStringQueryState<T extends string>(
  key: string,
  config: QueryStateOptions<T>
): UseQueryStateReturnType<T> {
  const { defaultValue, menu, options } = config

  const [value, setValue] = useQueryState(
    key,
    parseAsStringLiteral(menu)
      .withDefault(defaultValue)
      .withOptions({ ...options })
  )

  return [value, setValue] as const
}
