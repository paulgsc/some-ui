/**
 * @vitest-environment jsdom
 *
 * Settings → Connected AI services lists what the account allowed and
 * disconnects one on a press.
 */

import type { JSX, ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

type Grants = {
  held: Array<{ id: string; clientName: string; scopes: Array<string> }>
  disconnected: Array<string>
}

const grants = vi.hoisted((): Grants => ({ held: [], disconnected: [] }))

vi.mock("@/lib/oauth/client", () => ({
  createGrantsClient: (): object => ({
    list: (): Promise<typeof grants.held> => Promise.resolve([...grants.held]),
    disconnect: (id: string): Promise<void> => {
      grants.disconnected.push(id)
      grants.held = grants.held.filter((grant) => grant.id !== id)
      return Promise.resolve()
    },
  }),
}))

const { ConnectedServicesSection } = await import(
  "@/components/settings/connected-services-section"
)

function withQueryClient(children: ReactNode): JSX.Element {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

afterEach(() => {
  cleanup()
  grants.held = []
  grants.disconnected = []
})

describe("ConnectedServicesSection", () => {
  it("says when nothing is connected", async () => {
    render(withQueryClient(<ConnectedServicesSection />))
    expect(await screen.findByText(/^None\./)).toBeTruthy()
  })

  it("names each service and what it may do, and disconnects one", async () => {
    grants.held = [
      { id: "g1", clientName: "Claude", scopes: ["lessons:read", "shelf"] },
      { id: "g2", clientName: "ChatGPT", scopes: ["progress:read"] },
    ]
    render(withQueryClient(<ConnectedServicesSection />))
    expect(await screen.findByText("Claude")).toBeTruthy()
    expect(screen.getByText(/keep lessons on your own shelf/i)).toBeTruthy()
    expect(screen.getByText(/how your studying has gone/i)).toBeTruthy()

    const [first] = screen.getAllByRole("button", { name: /disconnect/i })
    await act(async () => {
      fireEvent.click(first)
      await Promise.resolve()
    })
    expect(grants.disconnected).toEqual(["g1"])
    await vi.waitFor(() => expect(screen.queryByText("Claude")).toBeNull())
    expect(screen.getByText("ChatGPT")).toBeTruthy()
  })
})
