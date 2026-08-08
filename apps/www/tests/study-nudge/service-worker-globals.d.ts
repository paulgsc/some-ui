/**
 * The handful of `ServiceWorkerGlobalScope` names the harness uses inside a
 * `worker.evaluate()` callback.
 *
 * Those callbacks are serialised and run inside the service worker, where
 * `registration`, `clients` and `NotificationEvent` are ordinary globals. But
 * they are *written* in a file this app type-checks against
 * `lib: ["ES2022", "DOM", "DOM.Iterable"]`, which has no service-worker
 * scope in it — so without these declarations the code is correct and the
 * compiler is right to reject it.
 *
 * Adding `"WebWorker"` to `lib` was the other option and it is worse: it
 * collides with `DOM` on dozens of shared names and would change how every
 * other file in `apps/www` type-checks, to fix three lines in a test helper.
 *
 * Declared narrowly on purpose. Only what the harness touches appears here,
 * so this cannot quietly become a second, wrong copy of the service-worker
 * lib — and anything it does not declare still fails to compile, which is the
 * behaviour worth keeping.
 */

/** `ServiceWorkerGlobalScope.registration`. */
declare const registration: {
  getNotifications: () => Promise<Array<Notification>>
}

/** The slice of `ServiceWorkerGlobalScope.clients` the click probe patches. */
declare const clients: {
  openWindow: (url: string) => Promise<unknown>
  matchAll: (options?: unknown) => Promise<Array<unknown>>
}

/**
 * Constructible in a service worker; absent from `lib.dom`. The harness
 * builds one to drive the real `notificationclick` handler, because no CDP
 * command clicks a notification.
 */
declare const NotificationEvent: new (
  type: string,
  init: { notification: Notification; action?: string }
) => Event

/**
 * `Notification.actions` is real and `lib.dom` does not declare it — the
 * Notifications API's action buttons are only exposed to service workers, so
 * the DOM lib omits them. The harness reads them back to assert that a nudge
 * offers "Start now" and "Later", which is a shape `nudge::payload` in
 * `paulgsc/server` depends on.
 */
/* `interface`, not `type`, and the rule has to yield here: declaration
   merging with the lib's own `Notification` is the entire mechanism, and a
   type alias cannot merge — it collides. */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
interface Notification {
  readonly actions: ReadonlyArray<{ action: string; title: string }>
}
