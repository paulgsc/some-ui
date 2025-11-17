Here’s a **retouched `README.md`** reflecting the latest optimizations, lazy initialization, draggable corners, and fullscreen auto-hide:

```markdown
# Streak Tracker Browser Extension

A minimalist, colorful browser extension that tracks your daily LeetCode streaks (and can be extended to other platforms later).

## Features

- 🔥 **Visual Streak Indicator**: Floating widget on every page showing your current streak
- 📊 **Hover Tooltip**: Detailed streak information with motivational messages
- ⚠️ **Zero Streak Alert**: Animated alert when streak reaches zero
- ⏱️ **Lazy Updates**: Fetches streak once per day or when storage is empty
- 🖱️ **Draggable**: Move the widget freely to any corner of the browser
- 🎥 **Auto-Hide**: Widget hides automatically when a video or page is fullscreen
- 🎛️ **Toggle Control**: Enable/disable tracking via popup interface
- 🎨 **Modern UI**: Colorful gradients and smooth animations
- ⚡ **Resource-Efficient**: Lightweight observers and minimal background processing

## Project Structure
```

streak-tracker/
├── src/
│ ├── background/
│ │ └── background.ts # Service worker for API calls (lazy, on-demand)
│ ├── content/
│ │ ├── content.ts # Content script for LeetCode pages
│ │ └── content.css # Styles for floating widget
│ ├── popup/
│ │ ├── popup.html # Extension popup UI
│ │ ├── popup.css # Popup styles
│ │ └── popup.js # Popup logic
│ └── assets/ # Icons (optional)
├── manifest.json # Extension manifest
├── vite.config.ts # Vite build configuration
├── server.js # Local API server
└── package.json

````

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
````

### 2. Start the Backend API

In a separate terminal:

```bash
# Install backend dependencies
npm install express cors

# Start the server
node server.js
```

The API runs on `http://localhost:3000` and creates a `streaks.json` file to store your data.

### 3. Build the Extension

```bash
npm run build
```

This creates a `dist/` folder with your compiled extension.

### 4. Load Extension in Browser

#### Chrome/Edge:

1. Navigate to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `dist/` folder

#### Firefox:

1. Navigate to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select any file in the `dist/` folder

### 5. Add Icons (Optional)

Place icon files in `src/assets/`:

- `icon-16.png` (16x16)
- `icon-48.png` (48x48)
- `icon-128.png` (128x128)

## Usage

1. Visit [leetcode.com](https://leetcode.com)
2. The extension detects your streak from the daily question button automatically
3. A floating indicator appears, draggable to any corner
4. Hover over the indicator to see detailed streak info
5. Fullscreen videos/pages auto-hide the widget
6. Click the extension icon to toggle tracking on/off

## How It Works

1. **Content Script** monitors the LeetCode page for streak updates
2. **Streak Detection** targets: `a[href*="daily-question"] span.text-brand-orange`
3. **Lazy Updates** fetch streak once per day or when local storage is empty
4. **Background Worker** handles API communication on-demand
5. **Fullscreen Auto-Hide** observes fullscreen events efficiently
6. **Draggable Widget** saves the position in local storage

## API Endpoints

- `GET /api/streak/:platform` - Fetch streak for a platform
- `POST /api/streak` - Update streak (body: `{platform, streak, lastUpdated}`)
- `DELETE /api/streak/:platform` - Delete streak data

## Extending to Other Platforms

1. Update `content.ts` to detect the new platform's URL
2. Add platform-specific selector logic in `startStreakMonitoring()`
3. Update the popup UI to display additional platforms
4. Backend supports multiple platforms via the `platform` parameter

## Development

```bash
# Watch mode for development
npm run dev

# Build for production
npm run build

# Type checking
npm run type-check
```

## Customization

### Change Colors

Edit the gradient in `content.css`:

```css
.streak-tracker-widget {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
```

### Change Position

Modify the default position in `content.css`:

```css
.streak-tracker-widget {
  top: 20px;
  right: 20px;
}
```

### Adjust Alert Behavior

Edit messages and thresholds in `content.ts` `updateWidget()` function.

## Troubleshooting

- **Extension doesn't appear**: Ensure backend API is running on port 3000
- **Streak not updating**: Verify LeetCode's HTML structure and check console for errors
- **CORS errors**: Ensure `manifest.json` has the correct host permissions

## License

MIT
