import type { ResumeRenderOutcome, ResumeRenderRequest } from "@some-ui/resume"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ResumeBuildRuntime } from "@/lib/resume-build"
import {
  createResumeBuild,
  parseBuilderSearch,
  pickFileName,
  serviceRender,
} from "@/lib/resume-build"

const request: ResumeRenderRequest = {
  variant: "backend",
  template: "classic",
  pii: { phone: "+1 (510) 555-0134" },
}

function deferred(): {
  promise: Promise<ResumeRenderOutcome>
  resolve: (outcome: ResumeRenderOutcome) => void
  reject: (error: unknown) => void
} {
  let resolve!: (outcome: ResumeRenderOutcome) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<ResumeRenderOutcome>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

type Harness = {
  runtime: ResumeBuildRuntime
  pending: Array<{ signal: AbortSignal; outcome: ReturnType<typeof deferred> }>
  created: Array<string>
  revoked: Array<string>
}

function harness(): Harness {
  const pending: Array<{
    signal: AbortSignal
    outcome: ReturnType<typeof deferred>
  }> = []
  const created: Array<string> = []
  const revoked: Array<string> = []
  const runtime = createResumeBuild({
    render: (_request, signal) => {
      const outcome = deferred()
      pending.push({ signal, outcome })
      return outcome.promise
    },
    urls: {
      create: () => {
        const url = `blob:${created.length}`
        created.push(url)
        return url
      },
      revoke: (url) => revoked.push(url),
    },
  })
  return { runtime, pending, created, revoked }
}

const pdf = (): ResumeRenderOutcome => ({
  kind: "pdf",
  pdf: new Blob(["%PDF"]),
  filename: "resume-backend-classic.pdf",
})

describe("createResumeBuild", () => {
  it("renders, then holds the PDF's URL", async () => {
    const { runtime, pending } = harness()
    runtime.build(request)
    expect(runtime.getSnapshot()).toEqual({ status: "rendering" })
    pending[0].outcome.resolve(pdf())
    await vi.waitFor(() =>
      expect(runtime.getSnapshot()).toEqual({
        status: "ready",
        url: "blob:0",
        filename: "resume-backend-classic.pdf",
      })
    )
  })

  it("names the PDF as asked, for a job pick", async () => {
    const { runtime, pending } = harness()
    runtime.build(request, pickFileName("tid-7f2a", request))
    pending[0].outcome.resolve(pdf())
    await vi.waitFor(() =>
      expect(runtime.getSnapshot()).toMatchObject({
        status: "ready",
        filename: "resume-tid-7f2a-backend-classic.pdf",
      })
    )
  })

  it("aborts and drops a render a newer one superseded", async () => {
    const { runtime, pending, created } = harness()
    runtime.build(request)
    runtime.build({ ...request, template: "safe" })
    expect(pending[0].signal.aborted).toBe(true)
    pending[1].outcome.resolve({ kind: "refused", message: "pii.phone: x." })
    pending[0].outcome.resolve(pdf())
    await vi.waitFor(() =>
      expect(runtime.getSnapshot()).toEqual({
        status: "refused",
        message: "pii.phone: x.",
      })
    )
    expect(created).toEqual([])
  })

  it("revokes a PDF's URL when a new build starts, and on dispose", async () => {
    const { runtime, pending, revoked } = harness()
    runtime.build(request)
    pending[0].outcome.resolve(pdf())
    await vi.waitFor(() => expect(runtime.getSnapshot().status).toBe("ready"))
    runtime.build(request)
    expect(revoked).toEqual(["blob:0"])
    pending[1].outcome.resolve(pdf())
    await vi.waitFor(() => expect(runtime.getSnapshot().status).toBe("ready"))
    runtime.dispose()
    expect(revoked).toEqual(["blob:0", "blob:1"])
    expect(runtime.getSnapshot()).toEqual({ status: "idle" })
  })

  it("turns a port that throws into a refusal", async () => {
    const { runtime, pending } = harness()
    runtime.build(request)
    pending[0].outcome.reject(new Error("boom"))
    await vi.waitFor(() =>
      expect(runtime.getSnapshot()).toEqual({
        status: "refused",
        message: "The résumé failed to render.",
      })
    )
  })
})

describe("parseBuilderSearch", () => {
  it("keeps a known composition, a contact-details layout and a pick id", () => {
    expect(
      parseBuilderSearch({
        variant: "data",
        template: "safe",
        pick: "tid-7f2a",
      })
    ).toEqual({ variant: "data", template: "safe", pick: "tid-7f2a" })
  })

  it("drops what it doesn't know, so a stale link still opens the page", () => {
    expect(
      parseBuilderSearch({ variant: "devops", template: "rail", pick: "../x" })
    ).toEqual({ variant: undefined, template: undefined, pick: undefined })
  })
})

describe("serviceRender", () => {
  afterEach(() => vi.unstubAllGlobals())

  const signal = new AbortController().signal

  it("posts the request and returns the PDF", async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(new Blob(["%PDF"]))))
    vi.stubGlobal("fetch", fetch)
    const outcome = await serviceRender(request, signal)
    expect(outcome.kind).toBe("pdf")
    expect(fetch).toHaveBeenCalledWith(
      "/api/resume/render",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(request),
      })
    )
  })

  it("passes the service's own reason on", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({ error: "pii.phone: too long." }, { status: 422 })
        )
      )
    )
    expect(await serviceRender(request, signal)).toEqual({
      kind: "refused",
      message: "pii.phone: too long.",
    })
  })

  it("says the service is unreachable for a network failure or a 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
    )
    const down = await serviceRender(request, signal)
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(new Response("<html>502</html>", { status: 502 }))
      )
    )
    const gateway = await serviceRender(request, signal)
    expect(down).toEqual(gateway)
    expect(down).toMatchObject({
      kind: "refused",
      message: expect.stringContaining("not reachable"),
    })
  })
})
