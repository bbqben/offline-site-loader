# Pagekeep — Offline website reader

A free, installable PWA for importing and browsing previously downloaded websites on iPhone. Works offline after installation. No backend, tracking or build step.

## Features

- Import a ZIP containing a complete website (HTML pages and supporting CSS, fonts, and images).
- Browse internal links offline, search saved page names, navigate backward and forward.
- Store multiple websites privately in IndexedDB on your device.
- Service worker caches Pagekeep's app shell for offline launch.
- A version number is visible at the bottom of the app so you can confirm updates.
- Imported HTML runs in a sandboxed iframe with original scripts removed and a restrictive CSP.

## Deploy with GitHub Pages

1. Make the repository public if needed.
2. Open Settings → Pages → Build and deployment → Deploy from a branch.
3. Set branch to main and folder to / (root), then save.
4. Open https://bbqben.github.io/offline-site-loader/ in iPhone Safari.
5. Share → Add to Home Screen; open once while online, then test in Airplane Mode.

## Create a website ZIP on your Mac

Use a mirror of the *published website* rather than a GitHub source-code archive where possible:

    brew install wget
    wget --mirror --convert-links --adjust-extension --page-requisites --no-parent \
      --directory-prefix="$HOME/Downloads/website-offline" \
      https://example.com/docs/
    cd ~/Downloads/website-offline
    zip -r ~/Downloads/website-offline.zip .

Transfer the ZIP to your phone with AirDrop or Files, then import into Pagekeep. You may optionally enter the original website URL to resolve absolute internal links.

## Limits and cautions

- **No file-count limit and no content-specific filtering.** All valid archive entries are imported.
- Files are decompressed individually, saved in small IndexedDB batches, and progress is shown periodically. JSZip still needs to parse the ZIP index in memory, so extremely large archives can exceed iPhone memory.
- Other safeguards: compressed ZIP up to 500 MiB; up to 1 GiB unpacked; up to 120 MiB per individual file. Device quota may be lower.
- Static pages work best. Original JavaScript, interactive search, API calls, and login flows won't work inside the offline viewer.
- Website source archives can contain unrelated source files. The importer stores those too; for the smallest archive use a published-site mirror.
- iOS may evict web-app data. Keep the original ZIP in Files for backup.
- Don't import untrusted archives; the sandbox reduces risk but isn't a guarantee against all attacks.

## Local testing

    python3 -m http.server 8000
    node --test tests/*.test.mjs

JSZip is vendored in vendor/ with its accompanying license.
