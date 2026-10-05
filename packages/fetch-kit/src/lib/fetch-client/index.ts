import { z } from "zod"

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export type FetchOptions<TBody = unknown> = {
  method?: HttpMethod
  headers?: HeadersInit
  body?: TBody
  cache?: RequestCache
  credentials?: RequestCredentials
  signal?: AbortSignal
  baseUrl?: string
  timeout?: number
  retry?: {
    count: number
    delay: number
    backoffFactor?: number
  }
}

export type FetchClient = {
  get: <T>(
    url: URL,
    options?: Omit<FetchOptions, "method" | "body">,
    schema?: z.ZodType<T>
  ) => Promise<T>

  post: <T, TBody = unknown>(
    url: URL,
    body?: TBody,
    options?: Omit<FetchOptions<TBody>, "method" | "body">,
    schema?: z.ZodType<T>
  ) => Promise<T>

  put: <T, TBody = unknown>(
    url: URL,
    body?: TBody,
    options?: Omit<FetchOptions<TBody>, "method" | "body">,
    schema?: z.ZodType<T>
  ) => Promise<T>

  patch: <T, TBody = unknown>(
    url: URL,
    body?: TBody,
    options?: Omit<FetchOptions<TBody>, "method" | "body">,
    schema?: z.ZodType<T>
  ) => Promise<T>

  delete: <T>(
    url: URL,
    options?: Omit<FetchOptions, "method">,
    schema?: z.ZodType<T>
  ) => Promise<T>

  createQueryFn: <T>(
    url: URL,
    method?: HttpMethod,
    options?: Omit<FetchOptions, "method">,
    schema?: z.ZodType<T>
  ) => () => Promise<T>

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  createMutationFn: <T, TVariables = unknown>(
    url: URL,
    method?: HttpMethod,
    options?: Omit<FetchOptions, "method" | "body">,
    schema?: z.ZodType<T>
  ) => (variables: TVariables) => Promise<T>
}

export class ApiError extends Error {
  public status: number
  public data: unknown
  public isNetworkError: boolean
  public isTimeoutError: boolean

  constructor(
    message: string,
    status: number,
    data?: unknown,
    isNetworkError = false,
    isTimeoutError = false
  ) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.data = data
    this.isNetworkError = isNetworkError
    this.isTimeoutError = isTimeoutError
  }
}

const DEFAULT_OPTIONS: FetchOptions = {
  baseUrl: "",
  timeout: 10000, // 10 seconds
  retry: {
    count: 1,
    delay: 1000,
    backoffFactor: 1.5,
  },
  credentials: "same-origin",
  headers: {
    "Content-Type": "application/json",
  },
}

/** A fetch client with timeouts, retries and optional Zod validation. */
export const createFetchClient = (
  defaultOptions: FetchOptions = {}
): FetchClient => {
  const options = { ...DEFAULT_OPTIONS, ...defaultOptions }

  async function processResponse<T>(
    response: Response,
    schema?: z.ZodType<T>
  ): Promise<T> {
    const contentType = response.headers.get("content-type")
    let data: unknown

    if (contentType?.includes("application/json")) {
      data = await response.json()
    } else if (contentType?.includes("text/")) {
      data = await response.text()
    } else {
      data = await response.blob()
    }

    if (!response.ok) {
      throw new ApiError(
        `Request failed with status ${response.status}`,
        response.status,
        data
      )
    }

    if (schema) {
      try {
        return schema.parse(data)
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ApiError("Response validation failed", 400, {
            data,
            validation: error.issues,
          })
        }
        throw error
      }
    }

    // No schema: the caller trusts the `T` it asked for, as with bare fetch().
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return data as T
  }

  async function executeFetch<T>(
    url: URL,
    fetchOptions: FetchOptions,
    schema?: z.ZodType<T>,
    retryCount = 0
  ): Promise<T> {
    const { timeout, retry, ...restOptions } = fetchOptions

    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      timeout || options.timeout
    )

    try {
      // `body` is already serialized by `fetchWithSchema`; serializing again
      // would double-encode JSON and mangle multipart bodies.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const body = restOptions.body as BodyInit | undefined
      // `headers` is always built internally as a plain string record, though
      // typed as the broader HeadersInit.
      const headers: Record<string, string> = {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        ...(options.headers as Record<string, string>),
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        ...(restOptions.headers as Record<string, string>),
      }

      // Let the platform set Content-Type (and the multipart boundary) for
      // structured bodies; forcing application/json here would break them.
      if (
        body instanceof FormData ||
        body instanceof URLSearchParams ||
        body instanceof Blob ||
        body instanceof ArrayBuffer
      ) {
        delete headers["Content-Type"]
      }

      const response = await fetch(url, {
        ...restOptions,
        signal: controller.signal,
        headers,
        body,
      })

      return await processResponse(response, schema)
    } catch (error) {
      if (error instanceof ApiError) {
        throw error
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiError("Request timed out", 408, undefined, false, true)
      }

      const isNetworkError =
        error instanceof TypeError && error.message.includes("fetch")
      if (
        isNetworkError &&
        retry &&
        retryCount < (retry.count || options.retry?.count || 0)
      ) {
        const backoffFactor =
          retry.backoffFactor || options.retry?.backoffFactor || 1
        const delay =
          (retry.delay || options.retry?.delay || 1000) *
          Math.pow(backoffFactor, retryCount)

        await new Promise((resolve) => setTimeout(resolve, delay))

        return executeFetch<T>(url, fetchOptions, schema, retryCount + 1)
      }

      throw new ApiError(
        error instanceof Error ? error.message : "Network request failed",
        0,
        undefined,
        isNetworkError,
        false
      )
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async function fetchWithSchema<T>(
    url: URL,
    options: FetchOptions = {},
    schema?: z.ZodType<T>
  ): Promise<T> {
    const mergedOptions = {
      ...options,
      headers: {
        ...options.headers,
      },
    }

    // JSON-serialize plain objects; FormData, URLSearchParams etc. pass through.
    if (
      mergedOptions.body &&
      typeof mergedOptions.body === "object" &&
      !(mergedOptions.body instanceof FormData) &&
      !(mergedOptions.body instanceof URLSearchParams) &&
      !(mergedOptions.body instanceof Blob) &&
      !(mergedOptions.body instanceof ArrayBuffer)
    ) {
      mergedOptions.body = JSON.stringify(mergedOptions.body)
    }

    // Validated once, in `processResponse`, which wraps a Zod failure in an
    // `ApiError`; re-parsing here would let a raw `ZodError` escape.
    return executeFetch<T>(url, mergedOptions, schema)
  }

  return {
    get<T>(
      url: URL,
      options: Omit<FetchOptions, "method" | "body"> = {},
      schema?: z.ZodType<T>
    ): Promise<T> {
      return fetchWithSchema<T>(url, { ...options, method: "GET" }, schema)
    },

    post<T, TBody = unknown>(
      url: URL,
      body?: TBody,
      options: Omit<FetchOptions<TBody>, "method" | "body"> = {},
      schema?: z.ZodType<T>
    ): Promise<T> {
      return fetchWithSchema<T>(
        url,
        { ...options, method: "POST", body },
        schema
      )
    },

    put<T, TBody = unknown>(
      url: URL,
      body?: TBody,
      options: Omit<FetchOptions<TBody>, "method" | "body"> = {},
      schema?: z.ZodType<T>
    ): Promise<T> {
      return fetchWithSchema<T>(
        url,
        { ...options, method: "PUT", body },
        schema
      )
    },

    patch<T, TBody = unknown>(
      url: URL,
      body?: TBody,
      options: Omit<FetchOptions<TBody>, "method" | "body"> = {},
      schema?: z.ZodType<T>
    ): Promise<T> {
      return fetchWithSchema<T>(
        url,
        { ...options, method: "PATCH", body },
        schema
      )
    },

    delete<T>(
      url: URL,
      options: Omit<FetchOptions, "method"> = {},
      schema?: z.ZodType<T>
    ): Promise<T> {
      return fetchWithSchema<T>(url, { ...options, method: "DELETE" }, schema)
    },

    /** A React Query `queryFn`. */
    createQueryFn<T>(
      url: URL,
      method: HttpMethod = "GET",
      options: Omit<FetchOptions, "method"> = {},
      schema?: z.ZodType<T>
    ) {
      return async () => {
        return fetchWithSchema<T>(url, { ...options, method }, schema)
      }
    },

    /** A React Query `mutationFn`. */
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
    createMutationFn<T, TVariables = unknown>(
      url: URL,
      method: HttpMethod = "POST",
      options: Omit<FetchOptions, "method" | "body"> = {},
      schema?: z.ZodType<T>
    ) {
      return async (variables: TVariables) => {
        return fetchWithSchema<T>(
          url,
          {
            ...options,
            method,
            body: variables,
          },
          schema
        )
      }
    },
  }
}

export const apiClient = createFetchClient()
