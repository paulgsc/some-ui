/**
 * The registry contract, as a test.
 *
 * `@some-ui/content-registry` lazily imports this applet and renders it
 * with whatever scene props the host associated with its key - which may be
 * none at all. `RegistryEntry`'s props are typed `any`, so nothing checks
 * that; the only way "mountable by the registry" stays true is to mount it
 * the way the registry does and see.
 */

import type { JSX } from "react"
import type { SpeechAdapter } from "@some-ui/speech"
import { SpeechProvider } from "@some-ui/speech"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { KoreanStudyPage } from "."

function renderApplet(node: JSX.Element): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

/** The applet's root, once mounted. */
const mounted = (): Promise<Element | null> =>
  waitFor(() => {
    const found = document.querySelector("[data-slot='topik-session']")
    expect(found).not.toBeNull()
    return found
  })

/**
 * A silent adapter, built from the `SpeechAdapter` contract alone: a host can
 * substitute a backend without the speech package's own test kit.
 */
function createSilentAdapter(): SpeechAdapter & { spoken: Array<string> } {
  const spoken: Array<string> = []
  return {
    id: "web-speech",
    supported: true,
    pending: 0,
    spoken,
    speak: (text: string): Promise<void> => {
      spoken.push(text)
      return Promise.resolve()
    },
    stop: () => undefined,
    subscribe: () => () => undefined,
    describe: () => ({
      platform: "browser",
      voice: null,
      availability: "available",
    }),
    pause: () => undefined,
    resume: () => undefined,
    setVolume: () => undefined,
    setPlaybackRate: () => undefined,
    dispose: () => undefined,
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("KoreanStudyPage - mountable by the registry", () => {
  it("renders with no props and no session provider at all", async () => {
    // Exactly what `componentRegistry.topik` does.
    expect(() => renderApplet(<KoreanStudyPage />)).not.toThrow()
    await mounted()
  })

  it("runs without a voice rather than refusing to run", async () => {
    // No <SpeechProvider> anywhere above it - the GitHub Pages build, a
    // story, a test, or simply a host that hasn't mounted one yet.
    renderApplet(<KoreanStudyPage />)
    await mounted()
    // Silence is a degraded lesson; a crash is not a lesson at all.
    expect(screen.queryByText(/SessionConfigProvider/i)).toBeNull()
  })

  it("uses the ambient speech session when a host has mounted one", async () => {
    const adapter = createSilentAdapter()

    renderApplet(
      <SpeechProvider
        config={{
          mode: "static",
          adapters: { server: () => adapter, static: () => adapter },
        }}
      >
        <KoreanStudyPage />
      </SpeechProvider>
    )
    await mounted()

    // The applet takes the page's voice rather than building its own - one
    // session, one pair of speakers, whoever ends up speaking.
    expect(adapter.spoken).toBeDefined()
  })

  it("inherits the host's theme instead of mounting its own", async () => {
    // The default opens no boundary: the user's theme reaches the applet.
    renderApplet(<KoreanStudyPage />)
    const root = await mounted()

    expect(root?.classList.contains("topik")).toBe(false)
    expect(root?.classList.contains("dark")).toBe(false)
  })

  it("opens the study boundary only when a host asks for it", async () => {
    renderApplet(<KoreanStudyPage appearance="topik" />)
    const root = await mounted()

    expect(root?.classList.contains("topik")).toBe(true)
    // Still never `dark`: the appearance is a palette, and forcing the mode on
    // top of it is what pinned `dark:*` utilities on under a light theme.
    expect(root?.classList.contains("dark")).toBe(false)
  })

  it("takes repository overrides for a host that owns its data", async () => {
    const load = vi.fn().mockResolvedValue([])
    const loadCatalog = vi.fn().mockResolvedValue({ version: "1", topiks: [] })

    renderApplet(
      <KoreanStudyPage
        topikRepository={{ load }}
        metadataRepository={{ loadCatalog }}
      />
    )
    await mounted()
    // The default repositories fetch over HTTP; a host that passed its own
    // must not find them running anyway.
    expect(loadCatalog).toHaveBeenCalled()
  })
})
