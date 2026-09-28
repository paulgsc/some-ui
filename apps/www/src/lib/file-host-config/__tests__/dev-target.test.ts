import type { Probe } from "@/file-host.dev"
import {
  CONTAINER_TARGET,
  devPortFile,
  resolveFileHostTarget,
} from "@/file-host.dev"
import { describe, expect, it } from "vitest"

const env = { XDG_RUNTIME_DIR: "/run/user/1000" }
const FILE = "/run/user/1000/file_host/dev-port.json"

const probe = (files: Record<string, string>, alive: Array<number>): Probe => ({
  read: (path) => files[path],
  alive: (pid) => alive.includes(pid),
})

describe("resolveFileHostTarget: vite dev's file_host", () => {
  it("is the container when no make dev has recorded a port", () => {
    expect(resolveFileHostTarget(env, probe({}, []))).toEqual({
      target: CONTAINER_TARGET,
      source: "container",
    })
  })

  it("is make dev's server while its process is alive", () => {
    const files = { [FILE]: '{"port":3001,"pid":42}' }
    expect(resolveFileHostTarget(env, probe(files, [42]))).toEqual({
      target: "http://127.0.0.1:3001",
      source: "dev",
      pid: 42,
    })
  })

  it("ignores a record left behind by a process that is gone", () => {
    const files = { [FILE]: '{"port":3001,"pid":42}' }
    expect(resolveFileHostTarget(env, probe(files, [])).source).toBe(
      "container"
    )
  })

  it("ignores a record that is not one", () => {
    for (const raw of [
      "",
      "{",
      '{"port":"3001","pid":42}',
      '{"port":0,"pid":42}',
      "null",
    ]) {
      expect(
        resolveFileHostTarget(env, probe({ [FILE]: raw }, [42])).source,
        raw
      ).toBe("container")
    }
  })

  it("lets FILE_HOST_PROXY_TARGET override both", () => {
    const files = { [FILE]: '{"port":3001,"pid":42}' }
    expect(
      resolveFileHostTarget(
        { ...env, FILE_HOST_PROXY_TARGET: "http://box:3000" },
        probe(files, [42])
      )
    ).toEqual({ target: "http://box:3000", source: "override" })
  })

  it("reads the path paulgsc/server's make dev writes", () => {
    expect(devPortFile(env)).toBe(FILE)
    expect(devPortFile({})).toBe("/tmp/file_host/dev-port.json")
  })
})
