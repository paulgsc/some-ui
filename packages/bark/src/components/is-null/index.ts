export type IsNull<T> = T extends null ? true : false

export type IsNil<T> = T extends null | undefined ? true : false

export function isNull(value: unknown): value is null {
  return value === null
}

export function isNil(value: unknown): value is null | undefined {
  return value == null
}
