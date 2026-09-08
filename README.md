# Wallet — Finance Tracker

A simple local finance tracker built as a Progressive Web App (PWA), with optional voice-powered transaction entry.

## What this app does

- tracks income and expenses
- stores data locally in the browser using SQLite (sql.js) persisted to IndexedDB / OPFS
- supports categories for expenses and income
- shows recent transactions, summaries, and charts
- supports currency selection, export/import, and clear-all
- lets you **speak a transaction** ("Spent 250 on groceries") and have it parsed and saved automatically, creating a new category on the fly if needed
- includes a PWA manifest and service worker for an installable experience
- applies basic client-side hardening for safer local data handling and rendering

## Project files

- `index.html` — main UI, layout, and security policy headers
- `app.js` — app logic, data management, rendering, import/export, and safety checks
- `db.js` — SQLite (sql.js) data layer, persisted to IndexedDB/OPFS
- `voice.js` — voice transaction entry: speech recognition, Gemini parsing, category auto-creation
- `crypto-vault.js` — passphrase-based AES-GCM encryption used to protect the stored Gemini API key
- `manifest.json` — PWA metadata and app icons
- `sw.js` — service worker cache and offline support
- `icons/` — app icons for the installable PWA

## Voice transaction entry

Tap the 🎤 button (next to the main **+** button) and speak a transaction, e.g.:

- "Spent 450 on groceries"
- "Received 3000 freelance payment"
- "Paid 1200 for electricity bill"

The transcript is sent to Google's Gemini API (`gemini-2.0-flash`, a small/cheap model) along with your existing category names. Gemini returns structured JSON (amount, type, category, note, date), which you review in a confirmation card before it's saved. If the suggested category doesn't already exist, it's created automatically.

### Setup

1. Get a free API key at [aistudio.google.com](https://aistudio.google.com/apikey).
2. In the app: **Settings → Gemini API Key** → paste the key, then choose a passphrase.
3. The key is encrypted (AES-GCM, key derived from your passphrase via PBKDF2) before being stored — only the encrypted blob, salt, and IV are saved to the local database. The passphrase itself and the derived encryption key are never stored; they exist only in memory for the current browser session.
4. The first time you use voice add each session, you'll be prompted for your passphrase to unlock the key. To change or remove the key, tap the settings row again.

### Requirements & limitations

- Requires a browser with Web Speech API support (Chrome, Edge, Safari — not all mobile browsers).
- Requires an internet connection to reach the Gemini API (the rest of the app works fully offline).
- Voice parsing accuracy depends on Gemini and your microphone/accent; always check the preview card before confirming.
- If you forget your passphrase, the encrypted key can't be recovered — you'll need to clear it and re-enter a new key.

## Run locally

From the project folder, run a simple local server:

- With Node:
  ```bash
  npx http-server
  ```

- Or with Python:
  ```bash
  python -m http.server 8000
  ```

Then open:

- `http://localhost:8080` or
- `http://localhost:8000`

## Install as a PWA

Open the app in a mobile browser and use the install option:

- Android / Chrome: menu → `Install app`
- iOS / Safari: share → `Add to Home Screen`

## Build an APK

This repository is a PWA, so it can be packaged into an APK using tools such as:

- [PWABuilder](https://www.pwabuilder.com)
- Capacitor
- Cordova

If you want a quick APK, use PWABuilder and provide a hosted URL or GitHub repo.

## Notes

- Data is saved locally in the browser (SQLite via sql.js, persisted to IndexedDB and, where supported, OPFS) and is not synced to a server.
- The only outbound network call the app makes is to the Gemini API, and only when you use voice transaction entry.
- The PWA manifest uses `display: standalone`, so installed apps open like a native app.
- The service worker caches app assets for offline support.

