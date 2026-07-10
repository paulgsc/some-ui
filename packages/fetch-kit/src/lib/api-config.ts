/**
 * Shared base-path convention for the `file_host` API. The server nests all
 * versioned routers under this prefix (`apps/servers/file_host/src/main.rs`,
 * server issue #103); `/health` is the one deliberate unversioned exception.
 */
export const API_V1_PREFIX = "/api/v1"

export const DEFAULT_API_BASE_URL = "http://nixos.local:3000"

/**
 * Builds a versioned `file_host` API URL from a path relative to the base
 * path (e.g. `/get_attributions/:id`), centralizing the `baseUrl` +
 * `/api/v1` convention instead of hardcoding full URLs at each call site.
 */
export function apiUrl(
  path: string,
  baseUrl: string = DEFAULT_API_BASE_URL
): URL {
  return new URL(`${API_V1_PREFIX}${path}`, baseUrl)
}
