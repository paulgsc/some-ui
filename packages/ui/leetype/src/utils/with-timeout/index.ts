export type PromiseFactory<T> = Promise<T> | (() => Promise<T>)

export async function withTimeout<T>(
  promiseOrFactory: PromiseFactory<T>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    let timerId: ReturnType<typeof setTimeout> | undefined

    const onAbort = (): void => {
      finish(() => {
        reject(getAbortReason())
      })
    }

    const cleanup = (): void => {
      if (timerId !== undefined) {
        clearTimeout(timerId)
      }
      if (signal) {
        signal.removeEventListener("abort", onAbort)
      }
    }

    const finish = (settleFn: () => void): void => {
      if (settled) return
      settled = true
      cleanup()
      settleFn()
    }

    const getAbortReason = (): unknown => {
      return (
        signal?.reason ??
        new DOMException("This operation was aborted", "AbortError")
      )
    }

    // Handle already-aborted signal upfront
    if (signal?.aborted) {
      finish(() => {
        reject(getAbortReason())
      })
      return
    }

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true })
    }

    // Set up timeout handler
    timerId = setTimeout(() => {
      finish(() => {
        reject(new Error(`Timeout after ${timeoutMs}ms`))
      })
    }, timeoutMs)

    // Resolve wrapped promise / factory safely
    try {
      const promise =
        typeof promiseOrFactory === "function"
          ? promiseOrFactory()
          : promiseOrFactory

      promise.then(
        (value) => {
          finish(() => {
            resolve(value)
          })
        },
        (err: unknown) => {
          finish(() => {
            reject(err)
          })
        }
      )
    } catch (syncErr) {
      finish(() => {
        reject(syncErr)
      })
    }
  })
}
