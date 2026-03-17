# yt-music-overlay

A browser extension that renders a lightweight now-playing overlay on your active tab, using a YouTube or YouTube Music tab as the audio source.

---

## Overview

This extension decouples the audio source from the visual interface. It allows you to track and visualize music playing in a background tab while you work in another.

- **Source:** Music plays in a background YouTube/YT Music tab.
- **Display:** A persistent, ambient overlay on your active tab surfaces the track info and a live visual interpretation.

---

## Core Idea: Music as State

The overlay treats music as a set of inferred dimensions rather than just metadata. Each song maps to a "musical state" (e.g., valence, arousal, intensity, and tempo) which drives:

- **Color Palette:** Shifts based on emotional tone.
- **Waveform Motion:** Animates according to energy levels.
- **Transitions:** Visual states evolve as the soundtrack changes.

---

## Architecture

The extension operates via three distinct components:

1.  **SOURCE (YouTube Tab):** Extracts metadata from the DOM. Renders no UI.
2.  **BACKGROUND:** Acts as a router, polling metadata from the source and broadcasting updates.
3.  **DISPLAY (Active Tab):** Receives updates and renders the draggable overlay and animated waveform.

---

## Extension Points

- **Audio Analysis:** Hook into `inferSongDims` to transition from placeholder values to real-time `AudioContext` or `AnalyserNode` data.
- **Visualization Model:** Modify the mapping (e.g., mapping valence to hue) or animation rules without touching extraction logic.
- **Metadata Extraction:** Update the scraping layer if YouTube’s DOM structure changes.

---

## Build & Installation

1.  `npm install`
2.  `npm run build`
3.  `npm run typecheck`
4.  Load the extension in your browser by pointing to the `dist/` directory.

---

> **Note:** This is designed as a passive overlay for low cognitive load and ambient presence, not a media controller.
