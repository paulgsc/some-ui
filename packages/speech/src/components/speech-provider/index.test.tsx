/**
 * The consumer-facing half of session isolation.
 *
 * An app renders `<SpeechProvider>` and never touches the singleton, the
 * adapter, or the queue. These tests are about what that buys it: a session
 * that exists exactly as long as the provider is mounted with a given
 * configuration, and that leaves nothing behind when it isn't.
 */

import type { JSX } from "react"
import type { SpeechAdapterRegistry } from "@speech/lib/adapters"
import { useSpeechQueue } from "@speech/lib/hooks"
import { peekSpeechQueue, resetSpeechQueue } from "@speech/lib/queue"
import type { ControllableAdapter } from "@speech/lib/testing"
import { createControllableAdapter, flushAsync } from "@speech/lib/testing"
import { act, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { SpeechProvider, useSpeechAdapter } from "."

afterEach(() => {
  resetSpeechQueue()
})

function trackingRegistry(): {
  registry: SpeechAdapterRegistry
  adapters: Array<ControllableAdapter>
} {
  const adapters: Array<ControllableAdapter> = []
  const create = (): ControllableAdapter => {
    const adapter = createControllableAdapter()
    adapters.push(adapter)
    return adapter
  }
  return { registry: { server: create, static: create }, adapters }
}

const Speaker = ({ phrase }: { phrase: string }): JSX.Element => {
  const { speak, isActive } = useSpeechQueue("test-component")
  return (
    <button type="button" onClick={() => speak(phrase)}>
      {isActive ? "speaking" : "idle"}
    </button>
  )
}

describe("SpeechProvider", () => {
  it("establishes a session and renders its children", async () => {
    const { registry, adapters } = trackingRegistry()

    render(
      <SpeechProvider
        config={{ mode: "server", adapters: registry }}
        fallback={<span>starting</span>}
      >
        <Speaker phrase="hello" />
      </SpeechProvider>
    )

    await waitFor(() => expect(screen.getByRole("button")).toBeDefined())
    expect(adapters).toHaveLength(1)
    expect(peekSpeechQueue()).not.toBeNull()
  })

  it("speaks through the session's adapter without the consumer naming one", async () => {
    const { registry, adapters } = trackingRegistry()

    render(
      <SpeechProvider config={{ mode: "server", adapters: registry }}>
        <Speaker phrase="hello from the consumer" />
      </SpeechProvider>
    )
    await waitFor(() => expect(screen.getByRole("button")).toBeDefined())

    await act(async () => {
      screen.getByRole("button").click()
      await flushAsync()
    })

    expect(adapters[0]?.calls.at(0)?.text).toBe("hello from the consumer")
  })

  it("ends the session when it unmounts", async () => {
    const { registry, adapters } = trackingRegistry()

    const view = render(
      <SpeechProvider config={{ mode: "server", adapters: registry }}>
        <Speaker phrase="hello" />
      </SpeechProvider>
    )
    await waitFor(() => expect(screen.getByRole("button")).toBeDefined())

    await act(async () => {
      screen.getByRole("button").click()
      await flushAsync()
    })
    expect(adapters[0]?.pending).toBe(1)

    await act(async () => {
      view.unmount()
      await flushAsync()
    })

    // Nothing is left speaking, and nothing is left owed - the app that
    // navigated away cannot leave the next page's session wedged.
    expect(adapters[0]?.pending).toBe(0)
    expect(adapters[0]?.disposeCount).toBeGreaterThan(0)
    expect(peekSpeechQueue()).toBeNull()
  })

  it("starts a clean session when the configuration changes", async () => {
    const { registry, adapters } = trackingRegistry()

    const view = render(
      <SpeechProvider
        config={{ mode: "server", voiceId: "onyx", adapters: registry }}
      >
        <Speaker phrase="first session" />
      </SpeechProvider>
    )
    await waitFor(() => expect(screen.getByRole("button")).toBeDefined())

    await act(async () => {
      screen.getByRole("button").click()
      await flushAsync()
    })

    await act(async () => {
      view.rerender(
        <SpeechProvider
          config={{ mode: "server", voiceId: "nova", adapters: registry }}
        >
          <Speaker phrase="second session" />
        </SpeechProvider>
      )
      await flushAsync()
    })

    expect(adapters).toHaveLength(2)
    expect(adapters[0]?.pending).toBe(0)
    expect(adapters[1]?.calls).toHaveLength(0)
    expect(peekSpeechQueue()?.getStore().get().totalProcessed).toBe(0)
  })

  it("does not rebuild the session when the same config is passed inline again", async () => {
    const { registry, adapters } = trackingRegistry()

    const view = render(
      <SpeechProvider config={{ mode: "server", adapters: registry }}>
        <Speaker phrase="hello" />
      </SpeechProvider>
    )
    await waitFor(() => expect(screen.getByRole("button")).toBeDefined())

    await act(async () => {
      // A fresh object literal with identical values - what every caller
      // writing `config={{ ... }}` produces on each render.
      view.rerender(
        <SpeechProvider config={{ mode: "server", adapters: registry }}>
          <Speaker phrase="hello" />
        </SpeechProvider>
      )
      await flushAsync()
    })

    expect(adapters).toHaveLength(1)
  })

  it("exposes the session's adapter to call sites that speak directly", async () => {
    const { registry, adapters } = trackingRegistry()

    const Direct = (): JSX.Element => {
      const adapter = useSpeechAdapter()
      return (
        <button type="button" onClick={() => void adapter.speak("direct")}>
          {adapter.id}
        </button>
      )
    }

    render(
      <SpeechProvider config={{ mode: "server", adapters: registry }}>
        <Direct />
      </SpeechProvider>
    )
    await waitFor(() => expect(screen.getByRole("button")).toBeDefined())

    await act(async () => {
      screen.getByRole("button").click()
      await flushAsync()
    })

    // The adapter a direct call site holds is the session's own - not a
    // second one built on the side.
    expect(adapters).toHaveLength(1)
    expect(adapters[0]?.calls.at(0)?.text).toBe("direct")
  })

  it("throws a directed error when the hooks are used outside a provider", () => {
    const Orphan = (): JSX.Element => {
      useSpeechAdapter()
      return <span>never rendered</span>
    }

    expect(() => render(<Orphan />)).toThrow(/SpeechProvider/)
  })
})
