import { apiClient } from "@some-ui/fetch-kit"

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
    return apiClient.get<unknown>(path)
  }
}

/**
 * Vite-based loader using dynamic imports
 */
export class ViteModuleLoader implements ResourceLoader {
  constructor(private modules: Record<string, () => Promise<unknown>>) {}

  async load(path: string): Promise<unknown> {
    const loader = this.modules[path]
    if (!loader) {
      throw new Error(`Module not found: ${path}`)
    }
    return loader()
  }
}

/**
 * In-memory loader for testing
 */
export class StaticResourceLoader implements ResourceLoader {
  constructor(private resources: Map<string, unknown>) {}

  // Synchronous under an async interface - see StaticFileDiscovery. The
  // throw becomes a rejection either way, which is what callers already
  // handle.
  load(path: string): Promise<unknown> {
    if (!this.resources.has(path)) {
      return Promise.reject(new Error(`Resource not found: ${path}`))
    }
    return Promise.resolve(this.resources.get(path))
  }
}
