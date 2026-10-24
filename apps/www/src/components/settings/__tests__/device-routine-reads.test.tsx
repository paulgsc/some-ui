/**
 * @vitest-environment jsdom
 *
 * LA12 in Settings: the choice to show the routine's files in Korean sends
 * nothing, names the paired home before it is made, takes a second press to
 * make and keeps the words that press agreed to, and takes a second press
 * to stop.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { READS_KEY } from "@/lib/home-link/routine"
import { parseReadLog } from "@/lib/home-link/routine-model"
import { ROUTINE_READS } from "@/lib/home-link/words"

const BASE = "https://home.example/api/v1"

const home = vi.hoisted((): { sent: Array<unknown> } => ({ sent: [] }))

vi.mock("@/lib/device-backend/native-http", () => ({
  homeRequest: (call: unknown): Promise<{ status: number; body: string }> => {
    home.sent.push(call)
    return Promise.resolve({ status: 200, body: '{"files":[]}' })
  },
}))
vi.mock("@/lib/home-link/credential", () => ({
  nativeCredential: {
    read: (): Promise<{ record: string; lost: boolean }> =>
      Promise.resolve({
        record: JSON.stringify({
          base: BASE,
          token: "t",
          id: "pairing-1",
          choicesLogged: true,
        }),
        lost: false,
      }),
  },
}))

afterEach(() => {
  cleanup()
  vi.resetModules()
  localStorage.clear()
  home.sent = []
})

async function mount(): Promise<void> {
  const { DeviceRoutineReads } = await import(
    "@/components/settings/device-routine-reads"
  )
  await act(async () => {
    render(<DeviceRoutineReads />)
    await Promise.resolve()
  })
}

const log = (): unknown => parseReadLog(localStorage.getItem(READS_KEY) ?? "[]")

describe("Settings' choice to show the routine's files", () => {
  it("sends nothing as it opens, and says they aren't shown", async () => {
    await mount()
    expect(await screen.findByText(ROUTINE_READS.off)).toBeTruthy()
    expect(home.sent).toEqual([])
    expect(localStorage.getItem(READS_KEY)).toBeNull()
  })

  it("asks first, naming home, and keeps the words agreed to on the second press", async () => {
    await mount()
    fireEvent.click(
      await screen.findByRole("button", { name: ROUTINE_READS.show })
    )
    const words = ROUTINE_READS.confirm("home.example")
    expect(screen.getByText(words)).toBeTruthy()
    expect(localStorage.getItem(READS_KEY)).toBeNull()

    fireEvent.click(
      screen.getByRole("button", { name: ROUTINE_READS.confirmYes })
    )
    expect(log()).toMatchObject([
      { kind: "shown", pairing: "pairing-1", said: words },
    ])
    expect(screen.getByText(/^Shown in Korean since /)).toBeTruthy()
    expect(screen.getByText(ROUTINE_READS.notYet)).toBeTruthy()
    // Choosing reads nothing: Korean does, while it is open.
    expect(home.sent).toEqual([])
  })

  it("cancels without a choice", async () => {
    await mount()
    fireEvent.click(
      await screen.findByRole("button", { name: ROUTINE_READS.show })
    )
    fireEvent.click(
      screen.getByRole("button", { name: ROUTINE_READS.confirmNo })
    )
    expect(localStorage.getItem(READS_KEY)).toBeNull()
    expect(
      screen.getByRole("button", { name: ROUTINE_READS.show })
    ).toBeTruthy()
  })

  it("stops on a second press, saying what stays", async () => {
    localStorage.setItem(
      READS_KEY,
      JSON.stringify([
        { kind: "shown", pairing: "pairing-1", at: 1, said: "yes" },
      ])
    )
    await mount()
    fireEvent.click(
      await screen.findByRole("button", { name: ROUTINE_READS.stop })
    )
    expect(screen.getByText(ROUTINE_READS.stopMore)).toBeTruthy()
    expect(log()).toHaveLength(1)

    fireEvent.click(screen.getByRole("button", { name: ROUTINE_READS.stopYes }))
    expect(log()).toMatchObject([
      { kind: "shown" },
      { kind: "hidden", pairing: "pairing-1" },
    ])
    expect(screen.getByText(ROUTINE_READS.off)).toBeTruthy()
    expect(home.sent).toEqual([])
  })
})
