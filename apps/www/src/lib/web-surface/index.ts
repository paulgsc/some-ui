import type { ComponentType, ReactNode } from "react"
import { lazyWithPreload } from "@some-ui/content-registry/registry/lazy-with-preload"
import type { ComponentRegistry } from "@some-ui/types"

import { hasAudience } from "@/lib/build-profile"

import type { BurnInsPreviewProps } from "./burn-ins/preview"
import type { LiveStageProps } from "./playoff-delta/stage"

/**
 * The web surface's door (`doors` in build.profiles.ts): the one place
 * outside a gated route that may import a "web"-audience workspace, today
 * `@some-ui/honeycomb`, `@some-ui/playoff-delta` and `@some-ui/burn-ins`.
 * What only the web has reaches shared code (the session player, the
 * extensions page, a standalone page) through here, and the Android app's
 * build gets nothing.
 *
 *   A4  every export hands out a gated workspace only behind the guard
 *       below, and something inert otherwise
 *       (packages/some-vite-config/AUDIENCES.md)
 *
 * The guard reads `VITE_DEVICE_BACKEND` inline, at each branch, so the
 * Android app's bundle drops the `import()` before chunking rather than
 * writing a chunk nothing loads (AUDIENCES.md, "Paths"); `hasAudience` keeps
 * a profile without "web" (a `mobile` dev server without the flag) from
 * reaching the stubs.
 */

/** The panels only the web surface binds, beside the shared registry's. */
export const WEB_PANEL_KEYS = ["hangul"] as const
export type WebPanelKey = (typeof WEB_PANEL_KEYS)[number]

export const WEB_PANELS: Partial<ComponentRegistry<WebPanelKey>> =
  import.meta.env.VITE_DEVICE_BACKEND !== "true" && hasAudience("web")
    ? {
        hangul: lazyWithPreload(() => import("./hangul/panel"), "HangulPanel"),
      }
    : {}

const Nothing = (): null => null

/**
 * The extensions tour's comb, given the host's brand mark; nothing where the
 * build has no web surface.
 */
export const ExtensionsComb: ComponentType<{ mark?: ReactNode }> =
  import.meta.env.VITE_DEVICE_BACKEND !== "true" && hasAudience("web")
    ? lazyWithPreload(() => import("@some-ui/honeycomb"), "ExtensionsComb")
        .Component
    : Nothing

/**
 * The Playoff Delta story stage (a desktop recording stage for the weekly
 * vlog), playing this season's real numbers (`./playoff-delta`); nothing
 * where the build has no web surface.
 */
export const PlayoffDeltaStage: ComponentType<LiveStageProps> =
  import.meta.env.VITE_DEVICE_BACKEND !== "true" && hasAudience("web")
    ? lazyWithPreload(
        () => import("./playoff-delta/stage"),
        "PlayoffDeltaLiveStage"
      ).Component
    : Nothing

/**
 * What every video carries (`@some-ui/burn-ins`, a desktop page for tuning
 * the subtitles and cards the recorder draws), with its font; nothing where
 * the build has no web surface.
 */
export const BurnInsPreview: ComponentType<BurnInsPreviewProps> =
  import.meta.env.VITE_DEVICE_BACKEND !== "true" && hasAudience("web")
    ? lazyWithPreload(() => import("./burn-ins/preview"), "BurnInsPreviewPage")
        .Component
    : Nothing

/**
 * The page an authorship mark's end card names (`/authorship`): the mark's
 * key and one video's record, read from its link; nothing where the build
 * has no web surface.
 */
export const AuthorshipRecord: ComponentType<{ code?: string }> =
  import.meta.env.VITE_DEVICE_BACKEND !== "true" && hasAudience("web")
    ? lazyWithPreload(
        () => import("./burn-ins/authorship"),
        "AuthorshipRecordPage"
      ).Component
    : Nothing

/**
 * The page the burn-ins recorder captures (`tests/record/burn-ins.ts`);
 * nothing where the build has no web surface.
 */
export const BurnInRecord: ComponentType =
  import.meta.env.VITE_DEVICE_BACKEND !== "true" && hasAudience("web")
    ? lazyWithPreload(() => import("./burn-ins/record"), "BurnInRecordPage")
        .Component
    : Nothing
