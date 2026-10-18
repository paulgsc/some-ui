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
import { DeviceReflectionsArrival } from "@/components/reflection/device-reflections-arrival"

const handedOff = vi.hoisted(() => vi.fn())
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
  letGoReflections: (ids: ReadonlyArray<string>): boolean => {
    handedOff(ids)
    return true
  },
}))
vi.mock("@some-ui/topik", () => ({
  readAloudPracticeRecord: (): null => null,
}))

afterEach(() => {
  cleanup()
  for (const batch of arrivals.getSnapshot()) arrivals.answer(batch, false)
  handedOff.mockReset()
})

async function shareOne(): Promise<void> {
  const { reflections } = await import("@/lib/session-reflection")
  reflections.keep({
    id: "now",
    sessionId: "s1",
    createdAt: "2026-10-10T09:00:00.000Z",
    atMs: 252_000,
    body: { kind: "text", text: "particles" },
  })
  await shareReflections({ sessionIds: ["s1"], only: ["now"] })
}

describe("DeviceReflectionsArrival", () => {
  it("asks after a share it did not start, and lets the reflection go once it arrived", async () => {
    render(<DeviceReflectionsArrival />)
    await shareOne()

    fireEvent.click(
      await screen.findByRole("button", { name: "They arrived: let them go" })
    )

    expect(handedOff).toHaveBeenCalledWith(["now"])
    expect(arrivals.getSnapshot()).toEqual([])
  })

  it("keeps the reflection when the person says it did not arrive", async () => {
    render(<DeviceReflectionsArrival />)
    await shareOne()

    fireEvent.click(
      await screen.findByRole("button", { name: "Keep them to share again" })
    )

    expect(handedOff).not.toHaveBeenCalled()
    expect(arrivals.getSnapshot()).toEqual([])
  })
})
