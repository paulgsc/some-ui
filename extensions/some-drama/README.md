# Drama Sentiment Tracker - Firefox Extension

A browser extension that captures emotional reactions while watching dramas with timestamped sentiment tracking.

## 🎯 Features

- **Floating Reaction Bar**: Always-visible pill showing current mood, rating, episode, and timestamp
- **Quick Capture Panel**: One-tap emoji selection with optional intensity and notes
- **Runtime Context Detection**: Automatically detects drama title, episode, and video timestamp from page
- **Zero Friction UX**: 2-second capture flow from impulse to recorded moment
- **Temporal Granularity**: Each emotion captured is timestamped to the exact video moment

## 🏗️ Architecture

This extension is built with:

- **TypeScript** for type safety
- **Vite** for bundling (no shared chunks between scripts)
- **Tailwind CSS** for styling (compiled to pure CSS)
- **Vanilla DOM manipulation** (no React runtime)

### Key Design Decisions

1. **No Shared Modules**: Content and background scripts have fully inlined types to avoid shared chunk issues
2. **Runtime Data Collection**: Drama title, episode, timestamp are all detected from the page at runtime
3. **Pure CSS Bundle**: Tailwind is compiled at build time, no CSS-in-JS runtime
4. **Mock Video Detection**: Currently uses `<video>` element detection; easily extensible to specific streaming platforms

## 📁 Project Structure

```
drama-sentiment-extension/
├── src/
│   ├── content/
│   │   ├── content.ts       # Main content script (all logic inlined)
│   │   └── content.css      # Tailwind input file
│   ├── background/
│   │   └── background.ts    # Background script (storage handling)
│   └── lib/
│       └── schema.ts        # Type definitions (reference only)
├── dist/                     # Build output (ignored in git)
├── manifest.json            # Firefox extension manifest
├── vite.config.ts           # Vite bundler configuration
├── tailwind.config.js       # Tailwind CSS configuration
├── postcss.config.js        # PostCSS configuration
├── tsconfig.json            # TypeScript configuration
└── package.json             # Dependencies
```

## 🚀 Setup & Development

### Prerequisites

- Node.js 18+ and npm
- Firefox Developer Edition (recommended) or Firefox 91+

### Installation

```bash
# Install dependencies
npm install

# Build the extension
npm run build

# Or watch mode for development
npm run dev
```

### Loading in Firefox

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Navigate to the `dist/` folder and select `manifest.json`
4. The extension is now loaded!

### Testing

1. Open any webpage with a `<video>` element (YouTube, Netflix, etc.)
2. The floating reaction bar should appear in the bottom-right corner
3. Click the bar to open the quick capture panel
4. Click an emoji to capture a sentiment moment
5. Captured moments are logged to console and saved to browser storage

## 🎨 UI Components

### Floating Bar (Collapsed State)

- Location: Bottom-right, above video controls
- Shows: Current mood emoji, rating, episode number, timestamp
- Click to expand to capture panel

### Quick Capture Panel (Expanded State)

- 6 core emotions with one-tap capture
- Intensity slider (optional adjustment)
- Optional note field
- Auto-closes after 1.5s or manual close

### Runtime Context Detection

The extension automatically detects:

- **Drama Title**: From page `<title>` tag (parsed)
- **Episode Number**: Extracted from title via regex patterns
- **Timestamp**: From `<video>` element's `currentTime`

## 🔧 Customization

### Adding Streaming Platform Support

Edit `src/content/content.ts` in the `detectDramaContext()` function:

```typescript
function detectDramaContext(): DramaContext {
  // Add platform-specific selectors
  if (window.location.hostname.includes("netflix.com")) {
    const titleEl = document.querySelector(".video-title")
    // ... Netflix-specific logic
  }

  if (window.location.hostname.includes("viki.com")) {
    const titleEl = document.querySelector(".episode-title")
    // ... Viki-specific logic
  }

  // Fallback to generic detection
  // ...
}
```

### Modifying Emotions

Edit the `EMOTIONS` array in `src/content/content.ts`:

```typescript
const EMOTIONS: EmotionConfig[] = [
  {
    type: "joy",
    emoji: "😊",
    label: "Joy",
    gradient: "from-pink-400 to-orange-300",
    glowColor: "shadow-pink-400/50",
  },
  // Add or modify emotions here
]
```

### Changing Polling Intervals

Currently mocked. To implement:

1. Add interval logic in `src/content/content.ts`
2. Use `setInterval()` to trigger polling prompt
3. Store last poll time in state

## 🐛 Debugging

### Enable Console Logs

All key actions log to console:

```
[Drama Sentiment] Initializing...
[Drama Sentiment] Initialized { dramaTitle: "...", ... }
[Background] Saved moment: abc-123
```

### Check Storage

```javascript
// In browser console
browser.storage.local.get(["moments"], console.log)
```

### Common Issues

**Floating bar not appearing:**

- Check if content script loaded: Look for `[Drama Sentiment] Initializing...` in console
- Verify CSS compiled: Check `dist/styles/content.css` exists
- Check z-index conflicts: Extension uses `z-[999999]`

**Context not detected:**

- No `<video>` element on page
- Add custom selectors for your streaming platform

**Build errors:**

- Clear `dist/` folder: `rm -rf dist && npm run build`
- Check for TypeScript errors: `npm run type-check`

## 📦 Build Output

After `npm run build`, the `dist/` folder contains:

```
dist/
├── manifest.json         # Extension manifest
├── content.js            # Bundled content script (~50KB)
├── background.js         # Bundled background script (~5KB)
├── styles/
│   └── content.css       # Compiled Tailwind CSS (~15KB)
└── assets/
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

## 🔐 Permissions

- `storage`: Save captured moments to browser storage
- `tabs`: Access current tab info
- `activeTab`: Interact with active page

## 📝 Data Schema

```typescript
interface CapturedMoment {
  id: string // Unique identifier
  timestamp: number // Seconds into video
  emotion: EmotionType // 'joy' | 'sadness' | 'love' | ...
  intensity: number // 0-1 scale
  emoji: string // Visual representation
  note?: string // Optional user note
  episodeId: string // e.g., "ep-33"
  dramaTitle: string // Runtime detected title
  capturedAt: number // Unix timestamp
}
```

## 🚧 Roadmap

- [ ] Polling prompt implementation (periodic check-ins)
- [ ] Export captured moments to JSON/CSV
- [ ] Visualization dashboard (bento box design)
- [ ] Platform-specific integrations (Netflix, Viki, etc.)
- [ ] Keyboard shortcuts (Cmd+E for quick capture)
- [ ] Cloud sync across devices

## 📄 License

MIT

---

Built with ❤️ for drama lovers who want to track their emotional journey.
