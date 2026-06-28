/**
 * Per-workspace migration ledger.
 *
 * Each workspace owns exactly one version counter, stored under
 * `<namespace>.__migration_version`. Workspace `w` at version `m` and
 * workspace `u` at version `n` are structurally independent — a migration
 * for `w` can never read or mutate `u`'s namespace.
 *
 * See GOOD_CITIZEN.md § "Migrations are per-workspace and isolated".
 */

export type StorageAdapter = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Storage surface visible to a single migration — scoped to one namespace. */
export type MigrationContext = {
  readonly namespace: string
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

/**
 * A forward-only migration step.
 *
 * `to` must be a positive integer greater than every preceding migration's
 * `to` value — the ledger enforces strict monotonicity at runtime.
 *
 * `up` receives a `MigrationContext` scoped to the target namespace; it
 * cannot represent access to any other workspace's data.
 */
export type Migration = {
  readonly to: number
  readonly up: (ctx: MigrationContext) => Promise<void>
}

const VERSION_SUFFIX = ".__migration_version"

function makeContext(
  namespace: string,
  storage: StorageAdapter
): MigrationContext {
  return {
    namespace,
    get(key: string): string | null {
      return storage.getItem(`${namespace}.${key}`)
    },
    set(key: string, value: string): void {
      storage.setItem(`${namespace}.${key}`, value)
    },
    remove(key: string): void {
      storage.removeItem(`${namespace}.${key}`)
    },
  }
}

/**
 * Run all pending migrations for `namespace`.
 *
 * - Reads the current version from `<namespace>.__migration_version`.
 * - Applies only migrations whose `to` exceeds the current version, in order.
 * - Persists the new version after each successful step (resume-safe).
 * - Idempotent: re-running an already-applied set is a no-op.
 * - Throws if `migrations` is not strictly monotonically increasing.
 *
 * @param namespace  Workspace identifier, e.g. "boyo" or "ytmo".
 * @param migrations Ordered, forward-only migration steps.
 * @param storage    Injectable storage adapter (e.g. a `localStorage`-backed or
 *                   `browser.storage.local`-backed implementation).
 */
export async function runMigrations(
  namespace: string,
  migrations: ReadonlyArray<Migration>,
  storage: StorageAdapter
): Promise<void> {
  for (let i = 1; i < migrations.length; i++) {
    const prevTo = migrations[i - 1]?.to ?? 0
    const curTo = migrations[i]?.to ?? 0
    if (curTo <= prevTo) {
      throw new Error(
        `[migration-ledger] ${namespace}: migration[${i}].to (${curTo}) must be > migration[${i - 1}].to (${prevTo})`
      )
    }
  }

  const versionKey = `${namespace}${VERSION_SUFFIX}`
  const raw = storage.getItem(versionKey)
  let current = raw !== null ? parseInt(raw, 10) : 0

  const ctx = makeContext(namespace, storage)

  for (const migration of migrations) {
    if (migration.to <= current) continue
    await migration.up(ctx)
    storage.setItem(versionKey, String(migration.to))
    current = migration.to
  }
}
