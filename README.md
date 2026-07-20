# Wallet — Finance Tracker

A simple local finance tracker built as a Progressive Web App (PWA).

## What this app does

- tracks income and expenses
- stores data locally in the browser using `localStorage`
- supports categories for expenses and income
- shows recent transactions, summaries, and charts
- supports currency selection, export/import, and clear-all
- includes a PWA manifest and service worker for an installable experience
- applies basic client-side hardening for safer local data handling and rendering

## Project files

- `index.html` — main UI, layout, and security policy headers
- `app.js` — app logic, data management, rendering, import/export, and safety checks
- `manifest.json` — PWA metadata and app icons
- `sw.js` — service worker cache and offline support
- `icons/` — app icons for the installable PWA

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

- Data is saved locally in the browser and is not synced to a server.
- The PWA manifest uses `display: standalone`, so installed apps open like a native app.
- The service worker caches app assets for offline support.
