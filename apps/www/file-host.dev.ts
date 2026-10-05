/**
 * Which `file_host` `vite dev` proxies to: the one run from source, while one
 * runs, and the container otherwise - without anyone choosing a port.
 *
 * The container holds 3000. paulgsc/server's `make dev` runs the server from
 * source beside it: it takes the next free port and records it, with its
 * pid, in a well-known file (`listen::PortFile` there). This reads that file.
 * A record whose process is gone is a leftover (a `kill -9` never cleans up)
 * and is ignored. `FILE_HOST_PROXY_TARGET` still overrides everything, for a
 * `file_host` on another machine.
 *
 * `fileHostDevPlugin` watches the file, and restarts the dev server when the
 * answer changes - `make dev` starting or stopping - so the switch needs no
 * hand either way. The restart reloads the page too, which matters for the
 * `VITE_FILE_HOST_ENDPOINT` below.
 *
 * The file's path is agreed with paulgsc/server's Makefile (`DEV_PORT_FILE`);
 * change both together.
 */

import fs from "node:fs"
import { dirname } from "node:path"
import type { Plugin } from "vite"

/**
 * What `vite dev` and `vite preview` refuse to forward to `file_host`, the
 * counterpart of `location ^~ /api/file-host/api/v1/tabs { return 404; }` in
 * nginx.https.conf. `file_host`'s tabs captures are unauthenticated and the
 * learning app does not use them, and a proxy with no path allowlist forwards
 * them to anyone who can reach the dev server (it listens on 0.0.0.0). A
 * stop-gap; the permanent fix is a separate decision.
 *
 * Judged the way nginx judges a location: on the path alone, dot segments
 * resolved, percent-escapes decoded and repeated slashes merged, so
 * `/api/file-host//api/v1/%74abs` is the tabs route and not something else. A
 * path that cannot be decoded is refused rather than guessed at.
 */
const BLOCKED_PROXY_PREFIXES: ReadonlyArray<string> = [
  "/api/file-host/api/v1/tabs",
]

export function isBlockedProxyPath(url: string | undefined): boolean {
  if (url === undefined) return false
  let path: string
  try {
    path = decodeURIComponent(new URL(url, "http://localhost").pathname)
  } catch {
    return true
  }
  path = path.replace(/\/{2,}/g, "/")
  return BLOCKED_PROXY_PREFIXES.some((prefix) => path.startsWith(prefix))
}

export const CONTAINER_TARGET = "http://127.0.0.1:3000"

export type FileHostTarget = {
  target: string
  source: "override" | "dev" | "container"
  /** The dev server's pid, when `source` is `dev`. */
  pid?: number
}

type Env = Readonly<Record<string, string | undefined>>

export type Probe = {
  read: (path: string) => string | undefined
  alive: (pid: number) => boolean
}

export function devPortFile(env: Env = process.env): string {
  return `${env.XDG_RUNTIME_DIR || "/tmp"}/file_host/dev-port.json`
}

const nodeProbe: Probe = {
  read: (path) => {
    try {
      return fs.readFileSync(path, "utf8")
    } catch {
      return undefined
    }
  },
  alive: (pid) => {
    try {
      process.kill(pid, 0)
      return true
    } catch (error) {
      // EPERM: it exists, it just isn't ours to signal.
      return error instanceof Error && "code" in error && error.code === "EPERM"
    }
  },
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const isPort = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) > 0 && Number(value) < 65536

export function resolveFileHostTarget(
  env: Env = process.env,
  probe: Probe = nodeProbe
): FileHostTarget {
  if (env.FILE_HOST_PROXY_TARGET) {
    return { target: env.FILE_HOST_PROXY_TARGET, source: "override" }
  }
  const raw = probe.read(devPortFile(env))
  if (raw !== undefined) {
    try {
      const record: unknown = JSON.parse(raw)
      if (isRecord(record)) {
        const { port, pid } = record
        if (isPort(port) && Number.isInteger(pid) && probe.alive(Number(pid))) {
          return {
            target: `http://127.0.0.1:${port}`,
            source: "dev",
            pid: Number(pid),
          }
        }
      }
    } catch {
      // A malformed record is no record: fall through to the container.
    }
  }
  return { target: CONTAINER_TARGET, source: "container" }
}

const DESCRIPTIONS: Record<
  FileHostTarget["source"],
  (resolved: FileHostTarget) => string
> = {
  override: (resolved) => `${resolved.target} (FILE_HOST_PROXY_TARGET)`,
  dev: (resolved) =>
    `${resolved.target} - file_host from source (make dev, pid ${resolved.pid ?? "?"})`,
  container: (resolved) =>
    `${resolved.target} - the container (no make dev running)`,
}

export function describeTarget(resolved: FileHostTarget): string {
  return DESCRIPTIONS[resolved.source](resolved)
}

/**
 * Restarts `vite dev` when `make dev` starts or stops, so the proxy follows.
 * The port file's directory is watched rather than the file, which comes and
 * goes; events are coalesced, and only a changed answer restarts.
 */
export function fileHostDevPlugin(current: FileHostTarget): Plugin {
  return {
    name: "file-host-dev-target",
    apply: "serve",
    configureServer(server): void {
      // eslint-disable-next-line no-console
      console.info(`[www] file_host: ${describeTarget(current)}`)
      if (process.env.FILE_HOST_PROXY_TARGET) return
      const dir = dirname(devPortFile())
      try {
        fs.mkdirSync(dir, { recursive: true })
      } catch {
        return
      }
      let timer: ReturnType<typeof setTimeout> | undefined
      const watcher = fs.watch(dir, () => {
        clearTimeout(timer)
        timer = setTimeout(() => {
          const next = resolveFileHostTarget()
          if (next.target === current.target) return
          // eslint-disable-next-line no-console
          console.info(`[www] file_host moved: ${describeTarget(next)}`)
          void server.restart()
        }, 300)
      })
      server.httpServer?.once("close", () => {
        clearTimeout(timer)
        watcher.close()
      })
    },
  }
}
