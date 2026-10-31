/**
 * @vitest-environment jsdom
 *
 * The question after a reflection share is asked from the app shell, so it
 * still comes when the button that shared is gone: mid-session, the drawer
 * remounts as the share sheet sends the app to the background.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { arrivals, shareReflections } from "@/lib/agent-export"
import { reflections } from "@/lib/session-reflection"
import { DeviceReflectionsArrival } from "@/components/reflection/device-reflections-arrival"

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Cache: "CACHE" },
  Encoding: { UTF8: "utf8" },
  Filesystem: {
    rmdir: (): Promise<void> => Promise.resolve(),
    writeFile: ({ path }: { path: string }): Promise<{ uri: string }> =>
      Promise.resolve({ uri: `file:///cache/${path}` }),
  },
}))
vi.mock("@capacitor/share", () => ({
  Share: { share: (): Promise<object> => Promise.resolve({}) },
}))
vi.mock("@/lib/tenant/queries", () => ({
  sessionsRepository: { list: (): Promise<[]> => Promise.resolve([]) },
}))
vi.mock("@/lib/reflection-voice", () => ({
  reflectionAudio: (): object => ({ get: () => Promise.resolve(null) }),
  isSaving: (): boolean => false,
  letGoReflections: (): boolean => true,
}))
vi.mock("@some-ui/topik", () => ({
  readAloudPracticeRecord: (): null => null,
}))

afterEach(() => {
  cleanup()
  reflections.letGo(reflections.getSnapshot().kept.map((r) => r.id))
  for (const batch of arrivals.getSnapshot()) arrivals.answer(batch, false)
})

const sharedSessions = (): Array<string> =>
  reflections.getSnapshot().shared.map((mark) => mark.sessionId)

async function shareOne(id = "now", sessionId = "s1"): Promise<void> {
  reflections.keep({
    id,
    sessionId,
    createdAt: "2026-10-10T09:00:00.000Z",
    atMs: 252_000,
    body: { kind: "text", text: "particles" },
  })
  await shareReflections({ sessionIds: [sessionId], only: [id] })
}

describe("DeviceReflectionsArrival", () => {
  it("asks after a share it did not start, and marks the session shared once it arrived, keeping the reflection (LG1)", async () => {
    render(<DeviceReflectionsArrival />)
    await shareOne()

    fireEvent.click(await screen.findByRole("button", { name: "They arrived" }))

    expect(sharedSessions()).toEqual(["s1"])
    expect(reflections.getSnapshot().kept.map((r) => r.id)).toEqual(["now"])
    expect(arrivals.getSnapshot()).toEqual([])
  })

  it("keeps the reflection when the person says it did not arrive", async () => {
    render(<DeviceReflectionsArrival />)
    await shareOne("later", "s2")

    fireEvent.click(
      await screen.findByRole("button", { name: "Keep them to share again" })
    )

    expect(sharedSessions()).not.toContain("s2")
    expect(reflections.getSnapshot().kept.map((r) => r.id)).toEqual(["later"])
    expect(arrivals.getSnapshot()).toEqual([])
  })

  it("asks once about every share still waiting, so one tap answers only what it showed", async () => {
    render(<DeviceReflectionsArrival />)
    await shareOne("first")
    await shareOne("second")

    expect(
      await screen.findByText(
        "Once they have, 2 reflections count as shared. They stay on this phone."
      )
    ).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "They arrived" }))

    expect(sharedSessions()).toEqual(["s1"])
    expect(reflections.getSnapshot().kept).toHaveLength(2)
    expect(arrivals.getSnapshot()).toEqual([])
  })
})
