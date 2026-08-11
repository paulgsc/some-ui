import { apiClient } from "@some-ui/fetch-kit"

/**
 * File Discovery Abstraction Layer
 * Responsible for: Given (P, E) → return S = string[]
 * No domain knowledge, no Zod, purely discovery.
 */

export type FileDiscovery = {
  listFiles(rootPath: string, extension: string): Promise<Array<string>>
}

/**
 * HTTP-based file discovery using a manifest file
 * Manifest should be a JSON array of file paths
 */
export class HttpFileDiscovery implements FileDiscovery {
  constructor(private manifestUrl: string) {}

  async listFiles(rootPath: string, extension: string): Promise<Array<string>> {
    const files = await apiClient.get<Array<string>>(this.manifestUrl)

    return files.filter((f) => f.startsWith(rootPath) && f.endsWith(extension))
  }
}

/**
 * Vite-based file discovery using import.meta.glob
 * Compile-time but more idiomatic for Vite projects
 */
export class ViteGlobDiscovery implements FileDiscovery {
  constructor(
    // private _globPattern: string, // This is never read for some reason!
    private modules: Record<string, () => Promise<unknown>>
  ) {}

  // Synchronous under an async interface: the modules map is already in
  // memory. `Promise.resolve` rather than `async` says that out loud.
  listFiles(rootPath: string, extension: string): Promise<Array<string>> {
    return Promise.resolve(
      Object.keys(this.modules).filter(
        (path) => path.startsWith(rootPath) && path.endsWith(extension)
      )
    )
  }

  getModules(): Record<string, () => Promise<unknown>> {
    return this.modules
  }
}

/**
 * In-memory discovery for testing or static sets
 */
export class StaticFileDiscovery implements FileDiscovery {
  constructor(private files: Array<string>) {}

  listFiles(rootPath: string, extension: string): Promise<Array<string>> {
    return Promise.resolve(
      this.files.filter((f) => f.startsWith(rootPath) && f.endsWith(extension))
    )
  }
}
