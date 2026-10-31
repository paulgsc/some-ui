/**
 * @module seeds
 *
 * Values a server's contract run seeds and hands the harness through the
 * environment, such as the name of a file it wrote for the signed-in subject
 * (paulgsc/server `scripts/seed_contract_run.py`). A contract that needs one
 * reads it here when its file loads, and is skipped by name, with the
 * variables it lacks, against a server nobody seeded: the same way a
 * `session` contract is skipped without a cookie.
 */

export type Seeded<TName extends string> = {
  /** Each value set; every one of them unless `skip` says otherwise. */
  readonly values: Readonly<Partial<Record<TName, string>>>
  /** Why the contracts needing them are skipped, naming what is missing. */
  readonly skip?: string
}

/**
 * Every one of `names` from `env`, or why the contracts needing them are
 * skipped. An empty value counts as absent.
 */
export function readSeeds<TName extends string>(
  names: ReadonlyArray<TName>,
  env: Readonly<Record<string, string | undefined>> = process.env
): Seeded<TName> {
  const values: Partial<Record<TName, string>> = {}
  const missing: Array<TName> = []
  for (const name of names) {
    const value = env[name]
    if (value === undefined || value === "") missing.push(name)
    else values[name] = value
  }
  if (missing.length === 0) return { values }
  return {
    values,
    skip: `needs what a seeded contract run sets: ${missing.map((name) => `$${name}`).join(", ")}`,
  }
}
