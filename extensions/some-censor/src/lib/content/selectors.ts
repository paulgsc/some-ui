/**
 * VIDEO_SELECTORS — the canonical list of YouTube renderer element tag names
 * that BOYO tracks. Shared between observer.ts and video-manager.ts to avoid
 * a circular import (observer imports VideoManager; VideoManager needs SEL for
 * scan()).
 */
export const VIDEO_SELECTORS = [
  "ytd-video-renderer",
  "ytd-rich-item-renderer",
  "ytd-grid-video-renderer",
  "ytd-compact-video-renderer",
  "ytd-playlist-panel-video-renderer",
] as const

export const SEL = VIDEO_SELECTORS.join(",")
