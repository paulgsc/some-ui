import { loadCodeFile } from "@input/lib/leetype/load-code-file" // Assuming this remains the import path

const cache = new Map<string, Promise<string>>()

/**
 * Loads a code file from a given path, caching the promise to avoid
 * re-fetching.
 * @param path The URL path to the code file.
 * @returns A promise that resolves to the code file content (string).
 */
export function loadCodeFile(path: string): Promise<string> {
  if (cache.has(path)) {
    // If the check for 'has' passed, 'get' is guaranteed to return a value.
    // We can safely cast here to 'Promise<string>' to satisfy strict TS
    // without the non-null assertion operator (!).
    return cache.get(path) as Promise<string>
  }

  const promise = fetch(path).then(async (res) => {
    if (!res.ok) {
      // Explicitly throw an Error object
      throw new Error(`Failed to load code file: ${path}, Status: ${res.status}`)
    }

    // Improved handling for missing body reader, returning text or throwing explicitly
    if (!res.body) {
      // If res.body is null, we can fallback to res.text() or assume an issue
      return res.text()
    }

    // Stream + accumulate chunks (lower peak memory than res.text())
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let result = ""

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      // The decode call will only accept Uint8Array if 'value' is not null
      result += decoder.decode(value, { stream: true })
    }

    // Final decode to get any buffered characters
    result += decoder.decode()
    return result
  })

  cache.set(path, promise)
  return promise
}
