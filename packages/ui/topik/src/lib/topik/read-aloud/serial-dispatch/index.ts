/**
 * The dispatch loop of a read-aloud runtime. Effects may dispatch, as when a
 * set is drawn and then begun; such an event waits for the current one's
 * effects to finish, so none acts on a stale state. `apply` reduces one
 * event and runs its effects; `settled` runs once the queue is empty.
 */
export function serialDispatch<E>(
  apply: (event: E) => void,
  settled: () => void
): (event: E) => void {
  const queue: Array<E> = []
  let dispatching = false
  return (event) => {
    queue.push(event)
    if (dispatching) return
    dispatching = true
    try {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        apply(next)
      }
    } finally {
      dispatching = false
    }
    settled()
  }
}
