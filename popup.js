/**
 * iNaturalist Map Enhancer - Popup Script
 * 
 * Handles the extension popup UI interactions and communicates with the content script
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const CONSTANTS = {
  DEFAULT_ENABLED: true,
  STATUS_MESSAGE_DURATION: 2000,
  INAT_URL_PATTERN: 'inaturalist.org/observations'
};

// ============================================================================
// DOM REFERENCES
// ============================================================================

let dom = {
  toggle: null,
  statusIndicator: null,
  statusMessage: null,
  reloadButton: null
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Checks if a URL is an iNaturalist observations page
 * @param {string} url - The URL to check
 * @returns {boolean} True if URL matches iNaturalist observations
 */
function isINatObservationsPage(url) {
  return url && url.includes(CONSTANTS.INAT_URL_PATTERN);
}

/**
 * Updates the status indicator display
 * @param {boolean} active - Whether the extension is active on the current page
 */
function updateStatus(active) {
  if (dom.statusIndicator) {
    dom.statusIndicator.textContent = active ? 'Active on this page' : 'Not active on this page';
    dom.statusIndicator.className = active ? 'status active' : 'status inactive';
  }
}

/**
 * Shows a temporary status message
 * @param {string} message - The message to display
 */
function showStatusMessage(message) {
  if (!dom.statusMessage) return;
  
  dom.statusMessage.textContent = message;
  dom.statusMessage.style.opacity = '1';
  
  setTimeout(() => {
    dom.statusMessage.style.opacity = '0';
  }, CONSTANTS.STATUS_MESSAGE_DURATION);
}

/**
 * Safely gets storage value with error handling
 * @param {string} key - Storage key to retrieve
 * @returns {Promise<any>} Promise resolving to the stored value
 */
function getStorageValue(key) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.sync.get([key], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result[key]);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Safely sets storage value with error handling
 * @param {string} key - Storage key
 * @param {any} value - Value to store
 * @returns {Promise<void>}
 */
function setStorageValue(key, value) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.sync.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Gets active tab information
 * @returns {Promise<chrome.tabs.Tab>}
 */
function getActiveTab() {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (tabs && tabs[0]) {
          resolve(tabs[0]);
        } else {
          reject(new Error('No active tab found'));
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Sends message to content script
 * @param {number} tabId - Tab ID
 * @param {Object} message - Message to send
 * @returns {Promise<any>} Response from content script
 */
function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Loads the toggle state from storage or content script
 */
async function loadToggleState() {
  try {
    const tab = await getActiveTab();
    const isOnINatPage = isINatObservationsPage(tab.url);
    
    updateStatus(isOnINatPage);
    
    if (isOnINatPage) {
      // Try to get state from content script first
      try {
        const response = await sendMessageToTab(tab.id, { action: 'getState' });
        if (response && response.hasOwnProperty('fullMapHeight')) {
          dom.toggle.checked = response.fullMapHeight;
          return;
        }
      } catch (error) {
        // Content script might not be ready, fall through to storage
      }
    }
    
    // Load from storage as fallback
    const storedValue = await getStorageValue('fullMapHeight');
    dom.toggle.checked = storedValue !== undefined ? storedValue : CONSTANTS.DEFAULT_ENABLED;
    
    // Set default if not exists
    if (storedValue === undefined) {
      await setStorageValue('fullMapHeight', CONSTANTS.DEFAULT_ENABLED);
    }
  } catch (error) {
    console.error('Failed to load toggle state:', error);
    dom.toggle.checked = CONSTANTS.DEFAULT_ENABLED;
  }
}

/**
 * Handles toggle change event
 */
async function handleToggleChange() {
  const isEnabled = dom.toggle.checked;
  
  try {
    // Save to storage
    await setStorageValue('fullMapHeight', isEnabled);
    
    // Send message to active tab if on iNat page
    const tab = await getActiveTab();
    if (isINatObservationsPage(tab.url)) {
      try {
        const response = await sendMessageToTab(tab.id, {
          action: 'toggleFullMapHeight',
          enabled: isEnabled
        });
        
        if (response && response.success) {
          showStatusMessage(isEnabled ? 'Map height increased!' : 'Map height restored');
        } else if (response && response.error) {
          console.error('Content script error:', response.error);
          showStatusMessage('Error: ' + response.error);
        }
      } catch (error) {
        console.error('Failed to send message to tab:', error);
        showStatusMessage('Please reload the page');
      }
    }
  } catch (error) {
    console.error('Failed to handle toggle change:', error);
    showStatusMessage('Error saving settings');
  }
}

/**
 * Handles reload button click
 */
async function handleReloadClick() {
  try {
    const tab = await getActiveTab();
    chrome.tabs.reload(tab.id);
  } catch (error) {
    console.error('Failed to reload tab:', error);
  }
}

/**
 * Initializes the popup
 */
function init() {
  // Cache DOM elements
  dom.toggle = document.getElementById('fullMapHeight');
  dom.statusIndicator = document.getElementById('status-indicator');
  dom.statusMessage = document.getElementById('status-message');
  dom.reloadButton = document.getElementById('reload-page');
  
  // Verify required elements exist
  if (!dom.toggle) {
    console.error('Required DOM elements not found');
    return;
  }
  
  // Load initial state
  loadToggleState();
  
  // Attach event listeners
  dom.toggle.addEventListener('change', handleToggleChange);
  
  if (dom.reloadButton) {
    dom.reloadButton.addEventListener('click', handleReloadClick);
  }
}

// ============================================================================
// ENTRY POINT
// ============================================================================

document.addEventListener('DOMContentLoaded', init);
