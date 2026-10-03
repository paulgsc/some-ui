/**
 * The snapshot this build carries, or `null` when it carries none.
 *
 * A plain JSON import: the file is tracked (see `schema.ts` for why), so
 * there is no "missing file" case to handle, and the placeholder reads as
 * `null`. Parsed once at module load; nothing here is async.
 */

import raw from "@/generated/loc-snapshot.json"

import type { LocSnapshot } from "./schema.ts"
import { readSnapshot } from "./schema.ts"

export const locSnapshot: LocSnapshot | null = readSnapshot(raw)
