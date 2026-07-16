export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"))
      return
    }

    const id = setTimeout(() => {
      reject(new Error(`Timeout after ${timeoutMs}ms`))
    }, timeoutMs)

    const onAbort = (): void => {
      clearTimeout(id)
      reject(new DOMException("Aborted", "AbortError"))
    }

    signal?.addEventListener("abort", onAbort, { once: true })

    promise.then(
      (value) => {
        clearTimeout(id)
        signal?.removeEventListener("abort", onAbort)
        resolve(value)
      },
      (err: unknown) => {
        clearTimeout(id)
        signal?.removeEventListener("abort", onAbort)
        reject(err)
      }
    )
  })
}
