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
    const res = await fetch(this.manifestUrl)
    if (!res.ok) {
      throw new Error(`Failed to fetch manifest: HTTP ${res.status}`)
    }

    const files: Array<string> = await res.json()

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

  async listFiles(rootPath: string, extension: string): Promise<Array<string>> {
    return Object.keys(this.modules).filter(
      (path) => path.startsWith(rootPath) && path.endsWith(extension)
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

  async listFiles(rootPath: string, extension: string): Promise<Array<string>> {
    return this.files.filter(
      (f) => f.startsWith(rootPath) && f.endsWith(extension)
    )
  }
}
