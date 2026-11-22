/**
 * @vitest-environment jsdom
 *
 * The door (A4, packages/some-vite-config/AUDIENCES.md): the web builds get
 * Hangul Honeycomb's panel, the extensions comb, the Playoff Delta stage,
 * the burn-ins' preview and recorder page, the weekly call's stage, the
 * Rust Rounds essay's and one of its scenes, and a build without a web
 * surface gets something inert in their place. Vitest builds the `lan`
 * profile; the Android app's build is stood in for by its flag, and a
 * profile without "web" by mocking `@/lib/build-profile`.
 */

import { sampleEssay } from "@some-ui/video-render"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as WebSurface from "."

const sample = sampleEssay()
if (!sample.ok) throw new Error(sample.problems.join("; "))
const SAMPLE_ESSAY = sample.value

async function loadDoor({
  device = false,
  web = true,
  pagesSite = false,
}: {
  device?: boolean
  web?: boolean
  pagesSite?: boolean
} = {}): Promise<typeof WebSurface> {
  vi.resetModules()
  vi.stubEnv("VITE_DEVICE_BACKEND", device ? "true" : "")
  vi.stubEnv("VITE_PAGES_SITE", pagesSite ? "true" : "")
  vi.doMock("@/lib/build-profile", () => ({
    hasAudience: (audience: string): boolean =>
      audience === "public" || (audience === "web" && web),
  }))
  return import(".")
}

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.doUnmock("@/lib/build-profile")
  vi.resetModules()
})

const isLazy = (component: unknown): boolean =>
  typeof component === "object" &&
  component !== null &&
  Reflect.get(component, "$$typeof") === Symbol.for("react.lazy")

describe("a web build", () => {
  it("binds Hangul Honeycomb's panel, the extensions comb, the Playoff Delta stage, the burn-ins' pages and the call's and essay's stages and an essay's scene", async () => {
    const {
      BurnInRecord,
      BurnInsPreview,
      CallStage,
      EssaySceneFrame,
      EssayStage,
      ExtensionsComb,
      PlayoffDeltaStage,
      WEB_PANELS,
    } = await loadDoor()

    expect(Object.keys(WEB_PANELS)).toEqual(["hangul"])
    expect(isLazy(ExtensionsComb)).toBe(true)
    expect(isLazy(PlayoffDeltaStage)).toBe(true)
    expect(isLazy(BurnInsPreview)).toBe(true)
    expect(isLazy(BurnInRecord)).toBe(true)
    expect(isLazy(CallStage)).toBe(true)
    expect(isLazy(EssayStage)).toBe(true)
    expect(isLazy(EssaySceneFrame)).toBe(true)
  })
})

describe("the public site (a CV; C1055)", () => {
  it("binds the authorship record and nothing else", async () => {
    const {
      AuthorshipRecord,
      BurnInRecord,
      BurnInsPreview,
      CallStage,
      EssaySceneFrame,
      EssayStage,
      ExtensionsComb,
      PlayoffDeltaStage,
      WEB_PANELS,
    } = await loadDoor({ pagesSite: true })

    expect(isLazy(AuthorshipRecord)).toBe(true)
    expect(WEB_PANELS).toEqual({})
    const { container } = render(
      <>
        <ExtensionsComb />
        <PlayoffDeltaStage />
        <BurnInsPreview />
        <BurnInRecord />
        <CallStage />
        <EssayStage />
        <EssaySceneFrame essay={SAMPLE_ESSAY} record />
      </>
    )
    expect(container.innerHTML).toBe("")
  })
})

describe("a build with no web surface", () => {
  it.each([
    ["the Android app's", { device: true, web: false }],
    ["a mobile dev server's (no device flag)", { device: false, web: false }],
    ["the device flag alone", { device: true, web: true }],
  ])("binds nothing in %s", async (_, build) => {
    const {
      BurnInRecord,
      BurnInsPreview,
      CallStage,
      EssaySceneFrame,
      EssayStage,
      ExtensionsComb,
      PlayoffDeltaStage,
      WEB_PANELS,
    } = await loadDoor(build)

    expect(WEB_PANELS).toEqual({})
    const { container } = render(
      <>
        <ExtensionsComb />
        <PlayoffDeltaStage />
        <BurnInsPreview />
        <BurnInRecord />
        <CallStage />
        <EssayStage />
        <EssaySceneFrame essay={SAMPLE_ESSAY} record />
      </>
    )
    expect(container.innerHTML).toBe("")
  })
})
