import type { FilterConfig, LegacyStyle } from "@filter/types/popup"

export const DEFAULT_LEGACY_STYLE: LegacyStyle = "invert"

/**
 * The two "legacy" filter looks. `dim` deliberately omits inversion (values
 * zeroed rather than left implicit — `FilterConfig` here is the
 * all-fields-required storage/message shape): it's meant to run alongside a
 * browser dark theme that already darkened the background, so only
 * brightness/contrast are touched.
 */
export const LEGACY_PRESETS: Record<LegacyStyle, FilterConfig> = {
  invert: {
    invert: 1,
    hueRotate: 180,
    sepia: 0.12,
    brightness: 0.5,
    contrast: 0.92,
  },
  dim: { invert: 0, hueRotate: 0, sepia: 0, brightness: 0.7, contrast: 0.95 },
}

export function isLegacyStyle(value: unknown): value is LegacyStyle {
  return value === "invert" || value === "dim"
}
