export function hasKey<K extends PropertyKey>(
  obj: object,
  key: K
): obj is Record<K, unknown> {
  return key in obj
}

export function isStringField<K extends PropertyKey>(
  obj: object,
  key: K
): obj is Record<K, string> {
  return hasKey(obj, key) && typeof obj[key] === "string"
}

export function isNumberField<K extends PropertyKey>(
  obj: object,
  key: K
): obj is Record<K, number> {
  return hasKey(obj, key) && typeof obj[key] === "number"
}

export function isBooleanField<K extends PropertyKey>(
  obj: object,
  key: K
): obj is Record<K, boolean> {
  return hasKey(obj, key) && typeof obj[key] === "boolean"
}

export function isArrayField<K extends PropertyKey, T>(
  obj: object,
  key: K,
  guard: (v: unknown) => v is T
): obj is Record<K, Array<T>> {
  return hasKey(obj, key) && Array.isArray(obj[key]) && obj[key].every(guard)
}
