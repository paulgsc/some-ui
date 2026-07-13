export function isError(error: unknown): error is Error {
  return error instanceof Error
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`)
}
