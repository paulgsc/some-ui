/**
 * The announcer against a real session, rather than a status sequence.
 *
 * `lib/status/index.test.ts` proves the machine is quiet. This proves the
 * machine is *wired to the thing that would be loud* - a failing backend
 * driving a queue that retries - and that what reaches the sink is a
 * disclosure rather than an internal.
 */

import type { JSX } from "react"
import type { SpeechAdapterRegistry } from "@speech/lib/adapters"
import { useSpeechQueue } from "@speech/lib/hooks"
import { resetSpeechQueue } from "@speech/lib/queue"
import type { SpeechNotice } from "@speech/lib/status"
import type { ControllableAdapter } from "@speech/lib/testing"
import { createControllableAdapter, flushAsync } from "@speech/lib/testing"
import { act, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { SpeechStatusBadge } from "."
import { SpeechProvider } from "../speech-provider"

afterEach(() => {
  resetSpeechQueue()
})

function trackingRegistry(overrides: Partial<ControllableAdapter> = {}): {
  registry: SpeechAdapterRegistry
  adapters: Array<ControllableAdapter>
} {
  const adapters: Array<ControllableAdapter> = []
  const create = (): ControllableAdapter => {
    const adapter = { ...createControllableAdapter(), ...overrides }
    adapters.push(adapter)
    return adapter
  }
  return { registry: { server: create, static: create }, adapters }
}

const Speaker = (): JSX.Element => {
  const { speak } = useSpeechQueue("test-component")
  return (
    <button type="button" onClick={() => speak("hello", undefined, 0, 0)}>
      speak
    </button>
  )
}

async function mountSession(
  notices: Array<SpeechNotice>,
  registry: SpeechAdapterRegistry
): Promise<void> {
  render(
    <SpeechProvider
      config={{ mode: "server", adapters: registry }}
      notify={(notice) => notices.push(notice)}
    >
      <Speaker />
      <SpeechStatusBadge showLabel />
    </SpeechProvider>
  )
  await waitFor(() => expect(screen.getByRole("button")).toBeDefined())
  await act(async () => {
    await flushAsync()
  })
}

describe("SpeechStatusAnnouncer", () => {
  it("discloses once when a session activates, and not again", async () => {
    const notices: Array<SpeechNotice> = []
    const { registry } = trackingRegistry()

    await mountSession(notices, registry)

    expect(notices.map((notice) => notice.kind)).toEqual(["activated"])
    expect(notices[0]?.tone).toBe("info")
  })

  it("says nothing more while speech is working", async () => {
    const notices: Array<SpeechNotice> = []
    const { registry, adapters } = trackingRegistry()
    await mountSession(notices, registry)

    for (let i = 0; i < 5; i++) {
      await act(async () => {
        screen.getByRole("button").click()
        await flushAsync()
        adapters[0]?.finish()
        await flushAsync()
      })
    }

    expect(notices).toHaveLength(1)
  })

  it("collapses a storm of failures into one warning", async () => {
    const notices: Array<SpeechNotice> = []
    const { registry, adapters } = trackingRegistry()
    await mountSession(notices, registry)

    // Twelve failed utterances - what a chat applet speaking per message
    // produces against a backend that is down, and the exact shape of the
    // thunderstorm this is here to prevent.
    for (let i = 0; i < 12; i++) {
      await act(async () => {
        screen.getByRole("button").click()
        await flushAsync()
        adapters[0]?.fail(new Error(`openai TTS API error: 503 (attempt ${i})`))
        await flushAsync()
      })
    }

    expect(notices.map((notice) => notice.kind)).toEqual([
      "activated",
      "faulted",
    ])
  })

  it("hands the sink a disclosure, never the underlying error", async () => {
    const notices: Array<SpeechNotice> = []
    const { registry, adapters } = trackingRegistry()
    await mountSession(notices, registry)

    await act(async () => {
      screen.getByRole("button").click()
      await flushAsync()
      adapters[0]?.fail(
        new Error("openai TTS API error: 503 - http://localhost:5050 refused")
      )
      await flushAsync()
    })

    const fault = notices.at(-1)
    expect(fault?.kind).toBe("faulted")
    expect(JSON.stringify(fault)).not.toMatch(/localhost|5050|503|openai/i)
  })

  it("announces recovery once when the next utterance succeeds", async () => {
    const notices: Array<SpeechNotice> = []
    const { registry, adapters } = trackingRegistry()
    await mountSession(notices, registry)

    await act(async () => {
      screen.getByRole("button").click()
      await flushAsync()
      adapters[0]?.fail(new Error("down"))
      await flushAsync()
    })

    await act(async () => {
      screen.getByRole("button").click()
      await flushAsync()
      adapters[0]?.finish()
      await flushAsync()
    })

    expect(notices.map((notice) => notice.kind)).toEqual([
      "activated",
      "faulted",
      "recovered",
    ])
  })

  it("warns once, not per utterance, when the runtime cannot speak at all", async () => {
    const notices: Array<SpeechNotice> = []
    const { registry } = trackingRegistry({ supported: false })

    await mountSession(notices, registry)
    await act(async () => {
      screen.getByRole("button").click()
      await flushAsync()
    })

    expect(notices.map((notice) => notice.kind)).toEqual(["unavailable"])
  })

  it("discloses through aria-live even when no sink is wired", async () => {
    const { registry } = trackingRegistry()

    render(
      <SpeechProvider config={{ mode: "server", adapters: registry }}>
        <Speaker />
      </SpeechProvider>
    )
    await waitFor(() => expect(screen.getByRole("button")).toBeDefined())
    await act(async () => {
      await flushAsync()
    })

    // An app that wires no toaster still discloses to assistive technology -
    // the disclaimer is not something a consumer can forget to opt into.
    const live = document.querySelector("[aria-live='polite']")
    expect(live?.textContent).toMatch(/voice output is on/i)
  })
})

describe("SpeechStatusBadge", () => {
  it("reports health and voice as data attributes an app can style", async () => {
    const notices: Array<SpeechNotice> = []
    const { registry, adapters } = trackingRegistry()
    await mountSession(notices, registry)

    const badge = screen.getByRole("status")
    expect(badge.getAttribute("data-speech-health")).toBe("ready")
    expect(badge.getAttribute("data-speech-voice")).toBe("device")
    expect(badge.getAttribute("aria-label")).toMatch(/voice output on/i)

    await act(async () => {
      screen.getByRole("button").click()
      await flushAsync()
      adapters[0]?.fail(new Error("down"))
      await flushAsync()
    })

    expect(screen.getByRole("status").getAttribute("data-speech-health")).toBe(
      "faulted"
    )
  })
})
