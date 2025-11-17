// Background script for managing state and API calls (Manifest V2 compatible)

const DB_API_URL = 'http://localhost:3000/api';

interface StreakData {
  leetcode: number;
  lastUpdated: string;
}

// Listen for messages from content script
browser.runtime.onMessage.addListener((message, _sender) => {
  if (message.type === 'UPDATE_STREAK') {
    return updateStreakInDB(message.platform, message.streak)
      .then(result => ({ success: true, data: result }))
      .catch(error => ({ success: false, error: error.message }));
  }

  if (message.type === 'GET_STREAK') {
    return getStreakFromDB(message.platform)
      .then(result => ({ success: true, data: result }))
      .catch(error => ({ success: false, error: error.message }));
  }

  if (message.type === 'GET_SETTINGS') {
    return browser.storage.local.get(['enabled']).then((result) => {
      return { enabled: result.enabled !== false }; // Default to true
    });
  }
});

// Listen for tab changes to trigger streak refresh
browser.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await browser.tabs.get(activeInfo.tabId);
  if (tab.url?.includes('leetcode.com')) {
    // Send message to content script to refresh streak display
    browser.tabs.sendMessage(activeInfo.tabId, { type: 'REFRESH_STREAK' }).catch(() => {
      // Ignore errors if content script not ready
    });
  }
});

// API functions
async function updateStreakInDB(platform: string, streak: number): Promise<StreakData> {
  const response = await fetch(`${DB_API_URL}/streak`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      platform,
      streak,
      lastUpdated: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to update streak in database');
  }

  return response.json();
}

async function getStreakFromDB(platform: string): Promise<number> {
  const response = await fetch(`${DB_API_URL}/streak/${platform}`);

  if (!response.ok) {
    throw new Error('Failed to fetch streak from database');
  }

  const data = await response.json();
  return data.streak || 0;
}

// Initialize default settings
browser.runtime.onInstalled.addListener(() => {
  browser.storage.local.set({ enabled: true });
});

export {}
