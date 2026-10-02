/**
 * Resource Loader Abstraction Layer
 * Responsible for: Given a file path → return parsed JSON (unvalidated)
 * No domain knowledge, no validation.
 */

export type ResourceLoader = {
  load(path: string): Promise<unknown>
}

/**
 * HTTP-based JSON loader
 */
export class HttpJsonLoader implements ResourceLoader {
  async load(path: string): Promise<unknown> {
    const res = await fetch(path)
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${path}`)
    }
    return res.json()
  }
}
