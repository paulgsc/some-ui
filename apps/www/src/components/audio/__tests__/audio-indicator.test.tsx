/**
 * @vitest-environment jsdom
 *
 * The speaker icon says who reads lessons aloud - the voice by name and the
 * platform - and flags a platform with no Korean voice, which is what a
 * Korean line that sounds un-Korean comes from.
 */

import type { JSX, ReactNode } from "react"
import type { SpeechAdapter, VoiceReport } from "@some-ui/speech"
import { SpeechProvider } from "@some-ui/speech"
import { httpSpeech } from "@some-ui/speech/http"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { markSignedIn } from "@/lib/auth"
import { AudioIndicator } from "@/components/audio/audio-indicator"

/**
 * An adapter that reports `report`, and whose `announce` replaces it the way
 * a browser's `voiceschanged` does.
 */
function reportingAdapter(
  initial: VoiceReport
): SpeechAdapter & { announce: (next: VoiceReport) => void } {
  let report = initial
  const listeners = new Set<() => void>()
  return {
    id: "web-speech",
    supported: true,
    pending: 0,
    describe: () => report,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    announce: (next): void => {
      report = next
      for (const listener of listeners) listener()
    },
    speak: () => Promise.resolve(),
    stop: () => undefined,
    pause: () => undefined,
    resume: () => undefined,
    setVolume: () => undefined,
    setPlaybackRate: () => undefined,
    dispose: () => undefined,
  }
}

function renderIndicator(session: (children: ReactNode) => JSX.Element): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      {session(<AudioIndicator />)}
    </QueryClientProvider>
  )
}

async function trigger(): Promise<HTMLElement> {
  return screen.findByRole("button", { name: /^Audio:/ })
}

// The popover's sliders measure themselves; jsdom has no ResizeObserver.
class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver)
  window.localStorage.clear()
  // The audio preferences come from the tenant settings query, which waits
  // for a session; see audio-activity-notice.test.tsx.
  markSignedIn()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("AudioIndicator - who reads lessons aloud", () => {
  it("names the hosted voice the session will use for Korean", async () => {
    renderIndicator((children) => (
      <SpeechProvider
        config={{
          mode: "server",
          hosted: { provider: "openai", voiceId: "ko-KR-InJoonNeural" },
          fallbackWhenUnsupported: false,
          adapters: { server: httpSpeech },
        }}
      >
        {children}
      </SpeechProvider>
    ))

    expect((await trigger()).getAttribute("title")).toBe(
      "Lessons: In-Joon (Korean Male) · this site's voice service"
    )
  })

  it("flags a browser with no Korean voice, and says what reads Korean instead", async () => {
    const adapter = reportingAdapter({
      platform: "browser",
      voice: "Samantha",
      availability: "missing",
    })
    renderIndicator((children) => (
      <SpeechProvider
        config={{
          mode: "static",
          adapters: { server: () => adapter, static: () => adapter },
        }}
      >
        {children}
      </SpeechProvider>
    ))

    const button = await trigger()
    expect(button.textContent).toContain("⚠")
    expect(button.getAttribute("title")).toBe(
      "Lessons: No Korean voice · your browser's own voice"
    )

    // Disabled until the audio preferences have loaded.
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false))
    fireEvent.click(button)
    expect(
      await screen.findByText(
        /reads Korean with Samantha, a voice for another language/
      )
    ).toBeDefined()
    // And the one step that fixes it (jsdom's user agent names no system).
    expect(
      screen.getByText(/Add a Korean voice in your system’s speech settings/)
    ).toBeDefined()
  })

  it("says it is checking, not that Korean is missing, until the browser's voices load", async () => {
    const adapter = reportingAdapter({
      platform: "browser",
      voice: null,
      availability: "checking",
    })
    renderIndicator((children) => (
      <SpeechProvider
        config={{
          mode: "static",
          adapters: { server: () => adapter, static: () => adapter },
        }}
      >
        {children}
      </SpeechProvider>
    ))
    const button = await trigger()
    expect(button.getAttribute("title")).toBe(
      "Lessons: Checking for a Korean voice · your browser's own voice"
    )
    expect(button.textContent).not.toContain("⚠")

    act(() => {
      adapter.announce({
        platform: "browser",
        voice: "Yuna",
        availability: "available",
      })
    })

    expect(button.getAttribute("title")).toBe(
      "Lessons: Yuna · your browser's own voice"
    )
    expect(button.textContent).not.toContain("⚠")
  })
})
