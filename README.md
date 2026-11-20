# Pagekeep — Offline Website Reader

A free, static, installable PWA for browsing previously downloaded website ZIP archives on iPhone, including linked pages, images and CSS. No backend, no tracking and no build step.

## Features

- Import a ZIP containing HTML pages and supporting files.
- Navigate linked pages offline, with page search and back/forward buttons.
- Save multiple website archives in IndexedDB, entirely on your device.
- An app-shell service worker lets the installed app open with no internet.
- Imported HTML is isolated in a sandboxed iframe with its original JavaScript removed and a restrictive CSP.

## Enable GitHub Pages

After you change this repository to Public:

1. Open Settings → Pages.
2. Set Build and deployment to Deploy from a branch.
3. Select main and / (root), then Save.
4. Visit https://bbqben.github.io/offline-site-loader/ in iPhone Safari.
5. Use Share → Add to Home Screen. Open while online once, then try Airplane Mode.

## Create an archive on your Mac

Install wget with Homebrew and mirror the whole target guide:

    brew install wget
    wget --mirror --convert-links --adjust-extension --page-requisites --no-parent \
      --directory-prefix="$HOME/Downloads/heartgold-offline" \
      https://originheartgold.github.io/guide/
    cd ~/Downloads/heartgold-offline
    zip -r ~/Downloads/heartgold-guide.zip .

Transfer the ZIP using AirDrop or Files, then import it in Pagekeep. The optional Original website URL is useful for mapping absolute links.

## Limits and safety

- V1 imports ZIP files; V2 can add URL crawling.
- Static HTML works best. Original site scripts, interactive search, forms, APIs and login flows will not work.
- Resources not included in the ZIP cannot load while offline.
- Limits: ZIP 500 MiB; total uncompressed 1 GiB; 20,000 files; 120 MiB per file. Large ZIPs may exhaust iPhone Safari memory or device storage; import smaller guide-only mirrors when possible.
- iOS may evict website data. Retain your original ZIP outside the app in the Files app.
- Malicious HTML and CSS are untrusted. Imported content is sanitized, run in an opaque-origin sandbox and denied network access by CSP; don't import unknown archives.

## Run locally

    python3 -m http.server 8000

Then open http://localhost:8000 and, to test paths, run:

    node --test tests/*.test.mjs

The included JSZip library is vendored under vendor/ and has its original license alongside it.
