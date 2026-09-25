import { existsSync, readdirSync, readFileSync } from "fs"
import { join } from "path"
import { z } from "zod"

import type { Audience } from "./schema.js"
import { MANIFEST_FIELD, parseManifestField } from "./schema.js"

export type AudienceWorkspace = {
  name: string
  dir: string
  audience: Audience
}

export type AudienceWorkspaces = {
  /** Longest name first, so "@some-ui/obs-x" is never matched as "@some-ui/obs". */
  workspaces: Array<AudienceWorkspace>
  /** One message per manifest whose `someUi` field is missing or invalid. */
  problems: Array<string>
}

/**
 * Reads the `someUi` field of every workspace directly under `roots`.
 *
 * The one reader both enforcement points share: `audiencePlugin` throws on
 * any problem, so a bad manifest fails `vite dev`/`vite build`, and
 * `scripts/check-ui-manifests.mjs` reports them repo-wide in CI, so the PR
 * that introduces one fails even when it builds no app.
 */
export function readAudienceWorkspaces(
  roots: ReadonlyArray<string>
): AudienceWorkspaces {
  const workspaces: Array<AudienceWorkspace> = []
  const problems: Array<string> = []
  const example = JSON.stringify({ [MANIFEST_FIELD]: { audience: "public" } })

  for (const root of roots) {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = join(root, entry.name)
      const manifestPath = join(dir, "package.json")
      if (!existsSync(manifestPath)) continue
      const manifest: Record<string, unknown> = JSON.parse(
        readFileSync(manifestPath, "utf8")
      )
      const field = parseManifestField(manifest[MANIFEST_FIELD])
      if (!field.success) {
        const detail = z.prettifyError(field.error)
        problems.push(
          `${manifestPath}: "${MANIFEST_FIELD}" is missing or invalid. ` +
            `Every workspace here must declare its audience, e.g. ${example}.\n${detail}`
        )
        continue
      }
      if (typeof manifest.name !== "string") continue
      workspaces.push({
        name: manifest.name,
        dir,
        audience: field.data.audience,
      })
    }
  }

  workspaces.sort((a, b) => b.name.length - a.name.length)
  return { workspaces, problems }
}
