import { describe, expect, it } from "vitest"

import type { FileHostTransport } from "@/lib/file-host-config/client"
import { createRoutineFilesClient } from "@/lib/routine-files"

describe("createRoutineFilesClient", () => {
  it("asks home for the routine's files and hands back its answer as it came", async () => {
    const answer = {
      files: [{ folder: "drama", name: "drama-1.json", file: { tree: {} } }],
    }
    const routes: Array<string> = []
    const transport: FileHostTransport = (route, init) => {
      routes.push(`${init?.method ?? "GET"} ${route}`)
      return Promise.resolve(Response.json(answer))
    }
    const client = createRoutineFilesClient(transport)
    await expect(client?.list()).resolves.toEqual(answer)
    expect(routes).toEqual(["GET /routine/files"])
  })

  it("is absent on a build with no home", () => {
    expect(createRoutineFilesClient(null)).toBeUndefined()
  })
})
