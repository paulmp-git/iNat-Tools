/**
 * iNaturalist Map Enhancer - Content Script
 * 
 * This script injects custom CSS to maximize the map height on iNaturalist observation pages
 * and handles any necessary DOM manipulations to improve the user experience.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const CONSTANTS = {
  MAP_HEIGHT_OFFSET: 135,  // Reduced for better 4K utilization
  MIN_MAP_HEIGHT: 600,
  OBS_PANEL_WIDTH: 350,    // Slightly wider for 4K readability
  OBS_PANEL_SPACING: 15,
  ZOOM_ADJUSTMENT: 0.5,
  MIN_ZOOM_LEVEL: 1,
  STYLE_ID: 'inat-map-enhancer-styles',
  DEBOUNCE_DELAY: 100
};

const SELECTORS = {
  MAP: '#map',
  LEAFLET_CONTAINER: '.leaflet-container',
  OBS_PANELS: [
    '#obs',
    '.observation-cards',
    '.ObservationsMapView .observations',
    '.observations',
    '.observation_list',
    '#observation_list',
    '.obs-container',
    '.observations-container',
    '.ObservationsMapView .sidebar',
    '.map-sidebar',
    '.map-results',
    '.map-panel',
    '.right-panel'
  ],
  MAP_CONTROLS: '.map-control-group, .map-controls'
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/** @type {Object} Store original map state for reverting */
let originalStyles = {
  zoom: null,
  center: null,
  mapHeight: null
};

/** @type {Object} Extension configuration */
let config = {
  fullMapHeight: true
};

/** @type {Object} Cached DOM elements */
const domCache = {
  map: null,
  obsPanel: null,
  leafletMap: null
};

/** @type {boolean} Track if styles have been applied */
let stylesApplied = false;

/** @type {boolean} Track if map has been found */
let mapFound = false;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Debounces a function call
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, delay) {
  let timer = null;
  return function executedFunction(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => func(...args), delay);
  };
}

/**
 * Safely queries the DOM and caches the result
 * @param {string} selector - CSS selector
 * @param {string} cacheKey - Key to store in cache
 * @returns {Element|null} DOM element or null
 */
function getCachedElement(selector, cacheKey) {
  if (!domCache[cacheKey] || !document.contains(domCache[cacheKey])) {
    domCache[cacheKey] = document.querySelector(selector);
  }
  return domCache[cacheKey];
}

/**
 * Tries multiple selectors and returns the first matching element
 * @param {string[]} selectors - Array of CSS selectors
 * @returns {Element|null} First matching element or null
 */
function findElementBySelectors(selectors) {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      return element;
    }
  }
  return null;
}

/**
 * Gets the Leaflet map instance from a map element
 * @param {Element} mapElement - The map container element
 * @returns {Object|null} Leaflet map instance or null
 */
function getLeafletMapInstance(mapElement) {
  if (!mapElement || !window.L) return null;
  
  // Try accessing through Leaflet's internal storage
  if (mapElement._leaflet_id && window.L.map && window.L.map._instances) {
    return window.L.map._instances[mapElement._leaflet_id];
  }
  
  // Fallback to global iNaturalist object
  if (window.GLOBALS && window.GLOBALS.map) {
    return window.GLOBALS.map;
  }
  
  return null;
}

// ============================================================================
// STORAGE FUNCTIONS
// ============================================================================

/**
 * Loads user preferences from Chrome storage
 */
function loadUserPreferences() {
  try {
    chrome.storage.sync.get(['fullMapHeight'], (result) => {
      if (chrome.runtime.lastError) {
        console.error('Storage error:', chrome.runtime.lastError);
        applyFullMapHeight(); // Default to enabled
        return;
      }
      
      if (Object.hasOwn(result, 'fullMapHeight')) {
        config.fullMapHeight = result.fullMapHeight;
        
        if (config.fullMapHeight) {
          applyFullMapHeight();
        } else {
          removeFullMapHeight();
        }
      } else {
        // Default behavior is to enable full map height
        applyFullMapHeight();
      }
    });
  } catch (error) {
    console.error('Failed to load preferences:', error);
    applyFullMapHeight(); // Default to enabled
  }
}

// ============================================================================
// STYLE INJECTION
// ============================================================================

/**
 * Applies full map height styles to the page
 */
function applyFullMapHeight() {
  // Skip if already applied
  if (stylesApplied) {
    return;
  }
  
  const mapStyles = `
    /* Base styles for the map container */
    #map {
      position: relative !important;
      height: calc(100vh - ${CONSTANTS.MAP_HEIGHT_OFFSET}px) !important;
      min-height: ${CONSTANTS.MIN_MAP_HEIGHT}px !important;
      width: 100% !important;
      overflow: hidden !important;
    }
    
    /* Fix for the leaflet container */
    .leaflet-container {
      height: 100% !important;
      width: 100% !important;
      overflow: hidden !important;
      /* Prevent horizontal map repetition */
      max-width: 100vw !important;
    }
    
    /* Fix for the map wrapper */
    .map-wrapper, .ObservationsMapView {
      height: auto !important;
      min-height: calc(100vh - ${CONSTANTS.MAP_HEIGHT_OFFSET}px) !important;
      width: 100% !important;
      overflow: hidden !important;
    }
    
    /* Fix for the row containing the map */
    .ObservationsMapView .row {
      width: 100% !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
    }
    
    /* Fix for the columns */
    .ObservationsMapView .col, 
    .ObservationsMapView .col-xs-12, 
    .ObservationsMapView .col-sm-12, 
    .ObservationsMapView .col-md-12, 
    .ObservationsMapView .col-lg-12 {
      padding-left: 0 !important;
      padding-right: 0 !important;
    }
    
    /* Hide footer to reclaim space */
    footer, .site-footer, #footer {
      display: none !important;
    }
    
    /* Reduce bottom margin on main container */
    .bootstrap, .container-fluid, .ObservationsMapView {
      margin-bottom: 0 !important;
      padding-bottom: 0 !important;
    }
    
    /* Ensure the observation panel is visible and properly styled */
    .ObservationsMapView .observation-cards,
    .ObservationsMapView .observations-list {
      position: absolute !important;
      top: ${CONSTANTS.OBS_PANEL_SPACING}px !important;
      bottom: ${CONSTANTS.OBS_PANEL_SPACING}px !important;
      right: ${CONSTANTS.OBS_PANEL_SPACING}px !important;
      width: ${CONSTANTS.OBS_PANEL_WIDTH}px !important;
      max-height: calc(100% - ${CONSTANTS.OBS_PANEL_SPACING * 2}px) !important;
      overflow-y: auto !important;
      z-index: 1000 !important;
      background: white !important;
      border-radius: 8px !important;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.25) !important;
    }
    
    /* Ensure the map legend and controls remain accessible */
    .leaflet-control-container {
      z-index: 1000 !important;
    }
    
    /* Improve visibility of map controls on 4K */
    .leaflet-control-zoom {
      margin-left: 10px !important;
      box-shadow: 0 1px 5px rgba(0,0,0,0.4) !important;
    }
    
    .leaflet-control-zoom a {
      width: 36px !important;
      height: 36px !important;
      line-height: 36px !important;
      font-size: 20px !important;
    }
  `;
  
  injectStyles(mapStyles, CONSTANTS.STYLE_ID);
  stylesApplied = true;
  
  // Use requestAnimationFrame for better performance
  requestAnimationFrame(() => {
    applyMapBounds();
    adjustMapZoom();
    window.dispatchEvent(new Event('resize'));
  });
}

/**
 * Removes full map height styles and restores original state
 */
function removeFullMapHeight() {
  const styleElement = document.getElementById(CONSTANTS.STYLE_ID);
  if (styleElement) {
    styleElement.remove();
  }
  
  stylesApplied = false;
  
  // Restore original zoom level if it was stored
  if (originalStyles.zoom !== null) {
    const mapElement = getCachedElement(SELECTORS.MAP, 'map');
    if (mapElement) {
      const leafletMap = getLeafletMapInstance(mapElement);
      
      if (leafletMap && typeof leafletMap.setZoom === 'function') {
        try {
          leafletMap.setZoom(originalStyles.zoom, {animate: false});
          if (originalStyles.center) {
            leafletMap.panTo(originalStyles.center, {animate: false});
          }
          leafletMap.invalidateSize({animate: false, pan: false});
        } catch (error) {
          console.error('Failed to restore map state:', error);
        }
      }
    }
  }
}

/**
 * Helper function to inject CSS styles
 * @param {string} css - CSS code to inject
 * @param {string} id - ID for the style element
 */
function injectStyles(css, id) {
  // Remove existing style element if it exists
  const existingStyle = document.getElementById(id);
  if (existingStyle) {
    existingStyle.remove();
  }
  
  // Create and append new style element
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  
  if (document.head) {
    document.head.appendChild(style);
  } else {
    // Fallback if head isn't available yet
    document.documentElement.appendChild(style);
  }
}

/**
 * Applies map bounds to prevent horizontal repetition (multiple world maps)
 */
function applyMapBounds() {
  const mapElement = getCachedElement(SELECTORS.MAP, 'map');
  if (!mapElement) return;
  
  const leafletMap = getLeafletMapInstance(mapElement);
  
  if (leafletMap && typeof leafletMap.setMaxBounds === 'function') {
    try {
      // Set bounds to prevent horizontal wrapping
      const southWest = window.L.latLng(-85, -180);
      const northEast = window.L.latLng(85, 180);
      const bounds = window.L.latLngBounds(southWest, northEast);
      
      leafletMap.setMaxBounds(bounds);
      leafletMap.setMinZoom(2); // Prevent zooming out too far
      
      // Also set the noWrap option on tile layers
      leafletMap.eachLayer((layer) => {
        if (layer.options && layer.setUrl) {
          layer.options.noWrap = true;
        }
      });
    } catch (error) {
      console.error('Failed to apply map bounds:', error);
    }
  }
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

/**
 * Listens for messages from the popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validate sender is from our extension
  if (!sender.id || sender.id !== chrome.runtime.id) {
    sendResponse({ success: false, error: 'Invalid sender' });
    return true;
  }
  
  try {
    if (message.action === 'toggleFullMapHeight') {
      config.fullMapHeight = message.enabled;
      
      if (config.fullMapHeight) {
        applyFullMapHeight();
      } else {
        removeFullMapHeight();
      }
      
      sendResponse({ success: true });
    } else if (message.action === 'getState') {
      sendResponse({ fullMapHeight: config.fullMapHeight });
    } else {
      sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Message handler error:', error);
    sendResponse({ success: false, error: error.message });
  }
  
  return true; // Required for async sendResponse
});

// ============================================================================
// MAP ADJUSTMENT FUNCTIONS
// ============================================================================

/**
 * Adjusts map zoom to fill available space
 */
function adjustMapZoom() {
  const mapElement = getCachedElement(SELECTORS.MAP, 'map');
  if (!mapElement) return;
  
  const leafletMap = getLeafletMapInstance(mapElement);
  
  if (leafletMap && typeof leafletMap.getZoom === 'function') {
    try {
      // Store original zoom if not already stored
      if (originalStyles.zoom === null) {
        originalStyles.zoom = leafletMap.getZoom();
        originalStyles.center = leafletMap.getCenter();
      }
      
      // Adjust zoom level (zoom out slightly to show more of the map)
      const currentZoom = leafletMap.getZoom();
      if (currentZoom > CONSTANTS.MIN_ZOOM_LEVEL) {
        leafletMap.setZoom(currentZoom - CONSTANTS.ZOOM_ADJUSTMENT, {animate: false});
      }
      
      // Force map to invalidate size and redraw
      leafletMap.invalidateSize({animate: false, pan: false});
    } catch (error) {
      console.error('Failed to adjust map zoom:', error);
    }
  }
  
  // Reposition observation cards if they exist
  repositionObservationCards();
}

/**
 * Applies inline styles to observation panel
 * @param {Element} panel - The observation panel element
 */
function applyObsPanelStyles(panel) {
  if (!panel) return;
  
  // Batch style updates to minimize reflows
  const styles = {
    position: 'absolute',
    top: `${CONSTANTS.OBS_PANEL_SPACING}px`,
    bottom: `${CONSTANTS.OBS_PANEL_SPACING}px`,
    right: `${CONSTANTS.OBS_PANEL_SPACING}px`,
    width: `${CONSTANTS.OBS_PANEL_WIDTH}px`,
    maxHeight: `calc(100% - ${CONSTANTS.OBS_PANEL_SPACING * 2}px)`,
    overflowY: 'auto',
    zIndex: '1000',
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 0 10px rgba(0, 0, 0, 0.2)'
  };
  
  Object.assign(panel.style, styles);
}

/**
 * Repositions observation cards and map controls
 */
function repositionObservationCards() {
  // Find observation panel
  const obsPanel = findElementBySelectors(SELECTORS.OBS_PANELS);
  
  if (obsPanel) {
    applyObsPanelStyles(obsPanel);
    domCache.obsPanel = obsPanel;
  }
  
  // Find and reposition map controls if needed
  const mapControls = document.querySelector(SELECTORS.MAP_CONTROLS);
  if (mapControls) {
    const controlStyles = {
      position: 'absolute',
      left: '10px',
      top: '10px',
      zIndex: '1000',
      backgroundColor: 'rgba(255, 255, 255, 0.8)',
      borderRadius: '4px',
      padding: '5px'
    };
    Object.assign(mapControls.style, controlStyles);
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Debounced function to handle map appearance
 */
const debouncedMapHandler = debounce(() => {
  if (config.fullMapHeight) {
    adjustMapZoom();
  }
}, CONSTANTS.DEBOUNCE_DELAY);

/**
 * Initializes the extension
 */
function init() {
  // Save original styles if needed for reverting
  const mapContainer = getCachedElement(SELECTORS.MAP, 'map');
  if (mapContainer) {
    originalStyles.mapHeight = mapContainer.style.height;
  }
  
  // Optimized MutationObserver - only watch for map and leaflet container
  const observer = new MutationObserver((mutations) => {
    // Early exit if map already found and styles applied
    if (mapFound && stylesApplied) return;
    
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if the added node is the map or contains the leaflet container
            if (node.id === 'map' || 
                node.classList?.contains('leaflet-container') ||
                node.querySelector?.('.leaflet-container')) {
              mapFound = true;
              debouncedMapHandler();
              break;
            }
          }
        }
      }
    }
  });
  
  // Observe only specific container instead of entire body
  const mainContainer = document.querySelector('.container, .ObservationsMapView, main') || document.body;
  observer.observe(mainContainer, { 
    childList: true, 
    subtree: true 
  });
  
  // Load user preferences
  loadUserPreferences();
  
  // Apply styles immediately if we're on the right page and map exists
  if (window.location.href.includes('inaturalist.org/observations')) {
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      if (config.fullMapHeight && getCachedElement(SELECTORS.MAP, 'map')) {
        applyFullMapHeight();
      }
    });
  }
}

// ============================================================================
// ENTRY POINT
// ============================================================================

// Run initialization when the page is fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
