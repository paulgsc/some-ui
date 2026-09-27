import type { Disposables } from "./disposables"

/**
 * ActiveScope — what runs only while nothing holds its owner dormant.
 *
 * An overlay has things that should run only while someone could see them —
 * an auto-advance timer, a particle layer, an animation — and several
 * independent reasons to stop: minimised, hidden by the user, the page not
 * showing, not yet entered. Tracking those as scattered start/stop calls is
 * how some-drama's card kept its timer running while hidden: each path
 * remembered some of the resources, and none remembered all of them.
 *
 * Here the resources are acquired in one place, `start(scope)`, against a
 * fresh child lifetime, and every reason to stop is a named hold:
 *
 *   const active = new ActiveScope(life, (scope) => {
 *     scope.interval(advance, 5_000)
 *     const blossoms = spawnBlossoms(root)
 *     scope.add(() => blossoms.destroy())
 *   }, ["entering"])
 *   active.hold("min", size === "min")
 *   active.release("entering")
 *
 * No holds → `start` runs in a new scope. Any hold → that scope is disposed,
 * releasing everything `start` acquired. There is no separate stop path to
 * forget. It ends with its parent lifetime.
 */
export class ActiveScope<Reason extends string = string> {
  private readonly holds = new Set<Reason>()
  private scope: Disposables | null = null

  constructor(
    private readonly parent: Disposables,
    private readonly start: (scope: Disposables) => void,
    initialHolds: Iterable<Reason> = []
  ) {
    for (const reason of initialHolds) this.holds.add(reason)
    parent.add(() => this.stop())
    this.sync()
  }

  /** True while `start`'s scope is live. */
  get active(): boolean {
    return this.scope !== null
  }

  /** Hold the owner dormant for `reason` (or release it, with `false`). */
  hold(reason: Reason, dormant = true): void {
    if (dormant) this.holds.add(reason)
    else this.holds.delete(reason)
    this.sync()
  }

  release(reason: Reason): void {
    this.hold(reason, false)
  }

  private sync(): void {
    const shouldRun = this.holds.size === 0 && !this.parent.disposed
    if (shouldRun && this.scope === null) {
      this.scope = this.parent.child()
      this.start(this.scope)
    } else if (!shouldRun) {
      this.stop()
    }
  }

  private stop(): void {
    this.scope?.dispose()
    this.scope = null
  }
}
