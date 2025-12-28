// Mock for webextension-polyfill in Storybook/testing environments

interface MockPort {
  postMessage: (message: any) => void
  disconnect: () => void
  onMessage: {
    addListener: (callback: Function) => void
    removeListener: (callback: Function) => void
    hasListener: (callback: Function) => boolean
  }
  onDisconnect: {
    addListener: (callback: Function) => void
    removeListener: (callback: Function) => void
    hasListener: (callback: Function) => boolean
  }
}

interface MockBrowser {
  runtime: {
    onMessage: {
      addListener: (callback: Function) => void
      removeListener: (callback: Function) => void
      hasListener: (callback: Function) => boolean
    }
    sendMessage: (message: any) => Promise<any>
    connect: (connectInfo?: { name?: string }) => MockPort
    getURL: (path: string) => string
    id?: string
  }
  tabs: {
    query: (queryInfo: any) => Promise<any[]>
    create: (createProperties: any) => Promise<any>
    update: (tabId: number, updateProperties: any) => Promise<any>
    remove: (tabIds: number | number[]) => Promise<void>
  }
  storage: {
    local: {
      get: (keys?: string | string[] | null) => Promise<any>
      set: (items: any) => Promise<void>
      remove: (keys: string | string[]) => Promise<void>
      clear: () => Promise<void>
    }
    sync: {
      get: (keys?: string | string[] | null) => Promise<any>
      set: (items: any) => Promise<void>
      remove: (keys: string | string[]) => Promise<void>
      clear: () => Promise<void>
    }
  }
  action?: {
    setBadgeText: (details: { text: string; tabId?: number }) => Promise<void>
    setBadgeBackgroundColor: (details: {
      color: string
      tabId?: number
    }) => Promise<void>
  }
  notifications?: {
    create: (notificationId?: string, options?: any) => Promise<string>
    clear: (notificationId: string) => Promise<boolean>
  }
}

// Store message listeners for testing
const messageListeners: Function[] = []

const mockBrowser: MockBrowser = {
  runtime: {
    onMessage: {
      addListener: (callback: Function) => {
        messageListeners.push(callback)
        // Store callback for testing purposes
        ;(globalThis as any).mockMessageCallback = callback
      },
      removeListener: (callback: Function) => {
        const index = messageListeners.indexOf(callback)
        if (index > -1) {
          messageListeners.splice(index, 1)
        }
      },
      hasListener: (callback: Function) => messageListeners.includes(callback),
    },
    sendMessage: (message: any) => {
      console.log("Mock browser.runtime.sendMessage:", message)
      return Promise.resolve({})
    },
    connect: (connectInfo?: { name?: string }) => ({
      postMessage: (message: any) => {
        console.log("Mock port.postMessage:", message)
      },
      disconnect: () => {
        console.log("Mock port.disconnect")
      },
      onMessage: {
        addListener: () => {},
        removeListener: () => {},
        hasListener: () => false,
      },
      onDisconnect: {
        addListener: () => {},
        removeListener: () => {},
        hasListener: () => false,
      },
    }),
    getURL: (path: string) => `chrome-extension://mock-extension-id/${path}`,
    id: "mock-extension-id",
  },
  tabs: {
    query: (queryInfo: any) => {
      console.log("Mock browser.tabs.query:", queryInfo)
      return Promise.resolve([])
    },
    create: (createProperties: any) => {
      console.log("Mock browser.tabs.create:", createProperties)
      return Promise.resolve({ id: Math.random() })
    },
    update: (tabId: number, updateProperties: any) => {
      console.log("Mock browser.tabs.update:", tabId, updateProperties)
      return Promise.resolve({})
    },
    remove: (tabIds: number | number[]) => {
      console.log("Mock browser.tabs.remove:", tabIds)
      return Promise.resolve()
    },
  },
  storage: {
    local: {
      get: (keys?: string | string[] | null) => {
        console.log("Mock browser.storage.local.get:", keys)
        return Promise.resolve({})
      },
      set: (items: any) => {
        console.log("Mock browser.storage.local.set:", items)
        return Promise.resolve()
      },
      remove: (keys: string | string[]) => {
        console.log("Mock browser.storage.local.remove:", keys)
        return Promise.resolve()
      },
      clear: () => {
        console.log("Mock browser.storage.local.clear")
        return Promise.resolve()
      },
    },
    sync: {
      get: (keys?: string | string[] | null) => {
        console.log("Mock browser.storage.sync.get:", keys)
        return Promise.resolve({})
      },
      set: (items: any) => {
        console.log("Mock browser.storage.sync.set:", items)
        return Promise.resolve()
      },
      remove: (keys: string | string[]) => {
        console.log("Mock browser.storage.sync.remove:", keys)
        return Promise.resolve()
      },
      clear: () => {
        console.log("Mock browser.storage.sync.clear")
        return Promise.resolve()
      },
    },
  },
  action: {
    setBadgeText: (details: { text: string; tabId?: number }) => {
      console.log("Mock browser.action.setBadgeText:", details)
      return Promise.resolve()
    },
    setBadgeBackgroundColor: (details: { color: string; tabId?: number }) => {
      console.log("Mock browser.action.setBadgeBackgroundColor:", details)
      return Promise.resolve()
    },
  },
  notifications: {
    create: (notificationId?: string, options?: any) => {
      console.log("Mock browser.notifications.create:", notificationId, options)
      return Promise.resolve(notificationId || "mock-notification-id")
    },
    clear: (notificationId: string) => {
      console.log("Mock browser.notifications.clear:", notificationId)
      return Promise.resolve(true)
    },
  },
}

// Helper function to trigger mock messages (useful for testing)
export const triggerMockMessage = (message: any) => {
  messageListeners.forEach((listener) => {
    try {
      listener(message, { tab: { id: 1 } }, () => {})
    } catch (error) {
      console.error("Error in mock message listener:", error)
    }
  })
}

export default mockBrowser
