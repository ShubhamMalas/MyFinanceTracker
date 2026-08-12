# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Run Locally
Since this is a static PWA, use a simple HTTP server to serve the files:
- Using Node: `npx http-server`
- Using Python: `python -m http.server 8000`

## Architecture & Structure

### High-Level Architecture
The project is a Progressive Web App (PWA) that acts as a local finance tracker. It is entirely client-side with no backend.

- **Frontend**: Pure HTML, CSS, and JavaScript.
- **Data Storage**: Uses `sql.js` to run a SQLite database in the browser's memory.
- **Persistence**: The SQLite database is exported as a binary `Uint8Array` and persisted to `IndexedDB` to ensure data survives page reloads.
- **PWA Capabilities**: Implements a service worker (`sw.js`) and a web manifest (`manifest.json`) for offline support and installability.

### Key Components
- `index.html`: Main UI layout and entry point.
- `app.js`: Core application logic, including rendering, transaction management, and data import/export.
- `db.js`: Database abstraction layer. Handles `sql.js` initialization, table setup, and persistence to `IndexedDB`.
- `sw.js`: Service worker for caching assets and providing offline access.
- `manifest.json`: PWA metadata.
