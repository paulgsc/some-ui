/**
 * The consumer-facing half of session isolation.
 *
 * An app renders `<SpeechProvider>` and never touches the singleton, the
 * adapter, or the queue. These tests are about what that buys it: a session
 * that exists exactly as long as the provider is mounted with a given
 * configuration, and that leaves nothing behind when it isn't.
 */

import type { JSX } from "react"
import { useEffect } from "react"
import type { SpeechAdapterRegistry } from "@speech/lib/adapters"
import { createWebSpeechAdapter } from "@speech/lib/adapters/web-speech"
import { useSpeechQueue } from "@speech/lib/hooks"
import { peekSpeechQueue, resetSpeechQueue } from "@speech/lib/queue"
import type { ControllableAdapter } from "@speech/lib/testing"
import {
  createControllableAdapter,
  createFakeSpeechSynthesis,
  flushAsync,
} from "@speech/lib/testing"
import { act, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { SpeechProvider, useSpeaker, useVoiceReport } from "."

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
        config={{
          mode: "server",
          hosted: { provider: "openai", voiceId: "onyx" },
          adapters: registry,
        }}
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
          config={{
            mode: "server",
            hosted: { provider: "openai", voiceId: "nova" },
            adapters: registry,
          }}
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

  it("gives applets the session's speaker, which speaks through the session's own adapter", async () => {
    const { registry, adapters } = trackingRegistry()

    const Direct = (): JSX.Element => {
      const speaker = useSpeaker()
      return (
        <button
          type="button"
          onClick={() => void speaker?.say("direct", { language: "korean" })}
        >
          speak
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

    // Not a second adapter built on the side: the session's own, and the
    // line carries its language, not a voice.
    expect(adapters).toHaveLength(1)
    expect(adapters[0]?.calls.at(0)?.text).toBe("direct")
    expect(adapters[0]?.calls.at(0)?.options.language).toBe("korean")
  })

  it("keeps a muted session silent, and says the line was muted", async () => {
    const { registry, adapters } = trackingRegistry()
    const outcomes: Array<unknown> = []

    const Direct = (): JSX.Element => {
      const speaker = useSpeaker()
      return (
        <button
          type="button"
          onClick={() =>
            void speaker
              ?.say("direct", { language: "korean" })
              .then((outcome) => outcomes.push(outcome))
          }
        >
          speak
        </button>
      )
    }

    render(
      <SpeechProvider config={{ mode: "server", adapters: registry }} muted>
        <Direct />
      </SpeechProvider>
    )
    await waitFor(() => expect(screen.getByRole("button")).toBeDefined())

    await act(async () => {
      screen.getByRole("button").click()
      await flushAsync()
    })

    expect(adapters[0]?.calls).toHaveLength(0)
    expect(outcomes).toEqual([{ kind: "muted" }])
  })

  it("is muted before any child can speak, even one that speaks on mount", async () => {
    const { registry, adapters } = trackingRegistry()

    // A child's effects run before its parent's, so this reaches the
    // speaker before any effect of the provider's own has run.
    const SpeaksOnMount = (): JSX.Element => {
      const speaker = useSpeaker()
      useEffect(() => {
        void speaker?.say("on mount", { language: "korean" })
      }, [speaker])
      return <span>mounted</span>
    }

    render(
      <SpeechProvider config={{ mode: "server", adapters: registry }} muted>
        <SpeaksOnMount />
      </SpeechProvider>
    )
    await waitFor(() => expect(screen.getByText("mounted")).toBeDefined())
    await act(async () => {
      await flushAsync()
    })

    expect(adapters[0]?.calls).toHaveLength(0)
  })

  it("keeps a displayed voice report current as the browser's voices load", async () => {
    const fake = createFakeSpeechSynthesis()
    const adapter = createWebSpeechAdapter({
      synthesis: fake.synthesis,
      utteranceFactory: fake.utteranceFactory,
    })

    const Report = (): JSX.Element => {
      const report = useVoiceReport("korean")
      return <span>{report?.voice ?? "no voice"}</span>
    }

    render(
      <SpeechProvider
        config={{
          mode: "static",
          adapters: { server: () => adapter, static: () => adapter },
        }}
      >
        <Report />
      </SpeechProvider>
    )
    await waitFor(() => expect(screen.getByText("no voice")).toBeDefined())

    act(() => {
      fake.controls.loadVoices([
        {
          name: "Yuna",
          lang: "ko-KR",
          voiceURI: "Yuna",
          default: false,
          localService: true,
        },
      ])
    })

    expect(screen.getByText("Yuna")).toBeDefined()
  })

  it("catches voices that load before the report starts listening", async () => {
    const fake = createFakeSpeechSynthesis()
    const adapter = createWebSpeechAdapter({
      synthesis: fake.synthesis,
      utteranceFactory: fake.utteranceFactory,
    })

    // As in Chrome: the first read comes back empty and starts the voices
    // loading, and they land before anything has subscribed.
    const readVoices = fake.synthesis.getVoices
    let loading = false
    fake.synthesis.getVoices = (): Array<SpeechSynthesisVoice> => {
      const voices = readVoices()
      if (!loading) {
        loading = true
        fake.controls.loadVoices([
          {
            name: "Yuna",
            lang: "ko-KR",
            voiceURI: "Yuna",
            default: false,
            localService: true,
          },
        ])
      }
      return voices
    }

    const Report = (): JSX.Element => {
      const report = useVoiceReport("korean")
      return <span>{report?.voice ?? "no voice"}</span>
    }

    render(
      <SpeechProvider
        config={{
          mode: "static",
          adapters: { server: () => adapter, static: () => adapter },
        }}
      >
        <Report />
      </SpeechProvider>
    )

    await waitFor(() => expect(screen.getByText("Yuna")).toBeDefined())
  })

  it("has no speaker outside a provider, rather than a broken one", () => {
    const Orphan = (): JSX.Element => (
      <span>{useSpeaker() === null ? "no speaker" : "a speaker"}</span>
    )

    render(<Orphan />)
    expect(screen.getByText("no speaker")).toBeDefined()
  })
})
