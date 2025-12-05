# iNaturalist Map Enhancer

A Chrome and Edge extension that enhances the iNaturalist observation map page by maximizing the map height and improving the layout.

## Features

- **Full Map Height Mode**: Expands the map to use the full viewport height, eliminating wasted vertical space
- **Toggle Controls**: Easily enable or disable the full map height feature
- **Compatible**: Works with both Chrome and Edge browsers
- **Targeted**: Only activates on iNaturalist observation pages

## Installation

### Chrome/Edge (Developer Mode)

1. Download or clone this repository
2. Open Chrome/Edge and navigate to the extensions page:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the extension folder
5. The extension should now be installed and active

## Usage

1. Navigate to the [iNaturalist observations page](https://www.inaturalist.org/observations)
2. The map will automatically expand to full height
3. Click the extension icon in the toolbar to access settings
4. Toggle "Full Map Height" on/off as needed

## Structure

- `manifest.json`: Extension configuration
- `content.js`: Handles CSS injection and DOM manipulation
- `popup.html`, `popup.js`, `popup.css`: Extension settings UI
- `icons/`: Extension icons

## Future Enhancements

- Toggle visibility of observation popup cards
- Reposition UI elements for better usability
- Additional customization options

## License

MIT License
