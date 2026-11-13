// Suspender Ledger's browser, answered from a walk's sample: run in the
// popup's page before its own scripts (suspender-ledger.ts says why). Plain
// script, read as text, since it runs in the page, not in Node.
;(sample) => {
  const KEY = "suspender-ledger-walk"
  const saved = sessionStorage.getItem(KEY)
  const state = saved
    ? JSON.parse(saved)
    : {
        tab: { ...sample.tab, discarded: false },
        local: { ...sample.settings },
      }
  const save = () => sessionStorage.setItem(KEY, JSON.stringify(state))
  const pick = (store, keys) => {
    if (keys === null || keys === undefined) return { ...store }
    const list = typeof keys === "string" ? [keys] : keys
    if (Array.isArray(list)) {
      return Object.fromEntries(
        list.filter((k) => k in store).map((k) => [k, store[k]])
      )
    }
    return Object.fromEntries(
      Object.entries(list).map(([k, d]) => [k, k in store ? store[k] : d])
    )
  }
  // Both call shapes, and `chrome` beside `browser`: the built popup also
  // carries a shared module that reads chrome.storage with callbacks and
  // listens to chrome.storage.onChanged.
  const answer = (value, done) => {
    if (typeof done === "function") done(value)
    return Promise.resolve(value)
  }
  const area = (store) => ({
    get: (keys, done) => answer(pick(store, keys), done),
    set: (values, done) => {
      Object.assign(store, values)
      save()
      return answer(undefined, done)
    },
  })
  const silent = { addListener: () => {}, removeListener: () => {} }
  const act = (m) => {
    if (!m || m.method !== "popup") return
    if (m.cmd === "discard-tab") state.tab.discarded = true
    if (m.cmd === "whitelist-domain") {
      const host = new URL(state.tab.url).hostname
      const list = Array.isArray(state.local.whitelist)
        ? state.local.whitelist
        : []
      state.local.whitelist =
        m.checked === false
          ? list.filter((r) => r !== host)
          : [...new Set([...list, host])]
    }
    save()
  }
  const api = {
    tabs: {
      query: (_, done) =>
        answer(
          [
            {
              ...state.tab,
              id: 1,
            },
          ],
          done
        ),
    },
    storage: {
      local: area(state.local),
      session: area({}),
      onChanged: silent,
    },
    commands: { getAll: (done) => answer(sample.shortcuts, done) },
    runtime: {
      getURL: (p) => new URL(p, location.origin).href,
      sendMessage: (m, done) => {
        act(m)
        return answer(undefined, done)
      },
      onMessage: silent,
    },
  }
  globalThis.browser = api
  globalThis.chrome = api
  // A suspend closes the popup; here the walk opens it again itself.
  window.close = () => {}
}
