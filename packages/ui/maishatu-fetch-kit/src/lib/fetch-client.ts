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
  onData?: (chunk: Uint8Array) => void
  // New option to specify the expected schema of the chunks.
  chunkSchema?: z.ZodType // Use `any` or a more specific type if known
}

// Return type definition for createFetchClient
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

  stream: (
    url: URL,
    options?: Omit<FetchOptions, "method" | "body">
  ) => Promise<void>
}

/**
 * API Error class for typed error responses
 */
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

/**
 * Default API options
 */
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

/**
 * Creates a fetch client with default configurations
 */
export const createFetchClient = (
  defaultOptions: FetchOptions = {}
): FetchClient => {
  const options = { ...DEFAULT_OPTIONS, ...defaultOptions }

  /**
   * Process the response with validation
   */
  async function processResponse<T>(
    response: Response,
    schema?: z.ZodType<T>
  ): Promise<T> {
    // Handle non-JSON responses
    const contentType = response.headers.get("content-type")
    let data: unknown

    if (contentType?.includes("application/json")) {
      data = await response.json()
    } else if (contentType?.includes("text/")) {
      data = await response.text()
    } else {
      data = await response.blob()
    }

    // Check if response is successful
    if (!response.ok) {
      throw new ApiError(
        `Request failed with status ${response.status}`,
        response.status,
        data
      )
    }

    // Validate response with Zod if schema is provided
    if (schema) {
      try {
        return schema.parse(data)
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ApiError("Response validation failed", 400, {
            data,
            validation: error.errors,
          })
        }
        throw error
      }
    }

    return data as T
  }

  /**
   * Execute the fetch with timeouts, retries, and error handling
   */
  async function executeFetch<T>(
    url: URL,
    fetchOptions: FetchOptions,
    retryCount = 0
  ): Promise<T> {
    const { timeout, retry, ...restOptions } = fetchOptions

    // Set up timeout controller
    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      timeout || options.timeout
    )

    try {
      const response = await fetch(url, {
        ...restOptions,
        signal: controller.signal,
        headers: {
          ...options.headers,
          ...restOptions.headers,
        },
        body: restOptions.body ? JSON.stringify(restOptions.body) : undefined,
      })

      return await processResponse(response)
    } catch (error) {
      clearTimeout(timeoutId)

      // Handle different types of errors
      if (error instanceof ApiError) {
        throw error
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiError("Request timed out", 408, undefined, false, true)
      }

      // Handle network errors and retry if configured
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

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, delay))

        return executeFetch<T>(url, fetchOptions, retryCount + 1)
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

  /**
   * Fetches data and validates with Zod schema
   */
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

    // Serialize body to JSON if it's not a FormData, URLSearchParams, etc.
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

    const data = await executeFetch<unknown>(url, mergedOptions)

    // Validate with schema if provided
    if (schema) {
      return schema.parse(data)
    }

    return data as T
  }

  /**
   * HTTP methods with Zod validation
   */
  return {
    /**
     * Performs a GET request
     */
    get<T>(
      url: URL,
      options: Omit<FetchOptions, "method" | "body"> = {},
      schema?: z.ZodType<T>
    ): Promise<T> {
      return fetchWithSchema<T>(url, { ...options, method: "GET" }, schema)
    },

    /**
     * Performs a POST request
     */
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

    /**
     * Performs a PUT request
     */
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

    /**
     * Performs a PATCH request
     */
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

    /**
     * Performs a DELETE request
     */
    delete<T>(
      url: URL,
      options: Omit<FetchOptions, "method"> = {},
      schema?: z.ZodType<T>
    ): Promise<T> {
      return fetchWithSchema<T>(url, { ...options, method: "DELETE" }, schema)
    },

    /**
     * Creates a query function for React Query
     */
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

    /**
     * Creates a mutation function for React Query
     */
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
    async stream(
      url: URL,
      options: Omit<FetchOptions, "method" | "body"> = {}
    ): Promise<void> {
      const { onData, chunkSchema, ...fetchOptions } = options
      const response = await fetch(url, {
        ...fetchOptions,
        method: "GET", //  For streaming, typically GET is used, but you might need to adjust.
        headers: {
          ...options.headers,
          // Important:  Ask the server for a stream of data.  The specific value
          // might need to change depending on your server's API.
          Accept: "application/octet-stream", // Or "application/x-ndjson", or whatever your server sends.
        },
      })

      if (!response.ok) {
        //  Handle errors as before.  Include the *entire* response body
        //  in the error message if possible.
        let errorData: any
        try {
          errorData = await response.json()
        } catch (jsonError) {
          // If it's not JSON, try to get the text.
          try {
            errorData = await response.text()
          } catch (textError) {
            // If we can't get JSON or text, just use a generic message.
            errorData = `(Unable to parse error response: ${response.statusText})`
          }
        }
        throw new ApiError(
          `Stream request failed with status ${response.status}`,
          response.status,
          errorData
        )
      }

      if (!response.body) {
        throw new ApiError("Response body is null", 500) // Or a more appropriate code.
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = new Uint8Array()

      const processStream = async (): Promise<void> => {
        const { done, value } = await reader.read()

        if (value) {
          //  Concatenate the new data.  This is crucial for handling
          //  chunk boundaries correctly.
          const newBuffer = new Uint8Array(buffer.length + value.length)
          newBuffer.set(buffer)
          newBuffer.set(value, buffer.length)
          buffer = newBuffer

          // Process the data, splitting if necessary
          let lastIndex = 0
          for (let i = 0; i < buffer.length; i++) {
            if (buffer[i] === 10) {
              //  Newline character (or whatever delimiter you use)
              const chunk = buffer.slice(lastIndex, i)
              lastIndex = i + 1 // Move past the delimiter

              if (onData) {
                //  Validate the chunk if a schema is provided.
                if (chunkSchema) {
                  try {
                    chunkSchema.parse(chunk) //  Parse, don't stringify
                  } catch (error) {
                    if (error instanceof z.ZodError) {
                      console.error("Chunk validation error:", error)
                      //  Decide how to handle the error:
                      //  1.  Throw an error to stop the stream.
                      //  2.  Skip this chunk and continue.
                      //  3.  Collect errors and process later.
                      //  For this example, we'll throw.
                      throw new ApiError("Chunk validation failed", 400, {
                        chunk: chunk,
                        validationErrors: error.errors,
                      })
                    }
                    //  Rethrow other errors.
                    throw error
                  }
                }
                onData(chunk)
              }
            }
          }
          // Keep the remaining part in the buffer
          buffer = buffer.slice(lastIndex)
          // Continue reading
          if (!done) {
            await processStream()
          }
        }

        if (done) {
          // Process any remaining data in the buffer
          if (buffer.length > 0 && onData) {
            if (chunkSchema) {
              try {
                chunkSchema.parse(buffer)
              } catch (error) {
                if (error instanceof z.ZodError) {
                  console.error("Final chunk validation error", error)
                  throw new ApiError("Final chunk validation failed", 400, {
                    chunk: buffer,
                    validationErrors: error.errors,
                  })
                }
                throw error
              }
            }
            onData(buffer)
          }
          //  No need to close the reader; it's done automatically.
        }
      }
      await processStream()
    },
  }
}

// Export a default instance with standard configuration
export const apiClient = createFetchClient()
