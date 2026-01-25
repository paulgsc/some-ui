browser.runtime.onInstalled.addListener(() => {
  browser.storage.local.set({ filterEnabled: true })
})

browser.browserAction.onClicked.addListener(async (tab) => {
  const { filterEnabled } = await browser.storage.local.get("filterEnabled")
  const next = !filterEnabled

  await browser.storage.local.set({ filterEnabled: next })

  // Tell the content script to update live
  if (tab.id) {
    browser.tabs.sendMessage(tab.id, {
      type: "SET_FILTER",
      enabled: next,
    })
  }
})
