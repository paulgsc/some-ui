
// Background script for GitHub Comment Remover extension
browser.runtime.onInstalled.addListener(() => {
      console.log('GitHub Comment Remover installed successfully');
      
      // Set up any initial configuration if needed
      browser.storage.local.set({
              autoHideComments: true,
              supportedExtensions: ['ts', 'tsx', 'rs', 'js', 'jsx']
            });
});

// Handle extension icon click
browser.browserAction.onClicked.addListener((tab) => {
      // This is handled by the popup, but we can add fallback logic here
      browser.tabs.sendMessage(tab.id, {action: 'toggleComments'});
});

// Listen for tab updates to refresh extension state
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url && tab.url.includes('github.com')) {
              // Optionally notify content script of navigation
              browser.tabs.sendMessage(tabId, {action: 'pageUpdated'});
            }
});
