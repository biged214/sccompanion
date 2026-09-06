# SC Companion

## Testing Downloads

Push changes to `codex/testing` to build Windows and Linux testing installers in
GitHub Actions. Open the **SC Companion testing builds** workflow, select a successful
run, and download the platform ZIP from **Artifacts**. Sign into GitHub to download,
extract the ZIP, then run the Windows setup EXE or install the Linux package.
Artifacts expire after 14 days; another push builds fresh packages.

These install as **SC Companion Testing**, with a separate application identifier,
binary name, and app data. They do not publish a release or update the live app.
Live auto-updates are disabled in testing builds. Settings and history start fresh.
Windows may still display SmartScreen because these installers are not Authenticode signed.
Only promote tested changes to `main` and publish a version tag when ready for live users.

## Data source attribution

External providers used by the app are registered in `src/dataSources.ts` and displayed in the
application footer. Add every new provider to that registry as part of integrating its data.

A desktop companion for Star Citizen service status, patch notes, news, ships, ship components, commodity trade planning, and local gameplay history. It uses Tauri, React, TypeScript, Rust, and SQLite in a native desktop UI.

## What This POC Covers

- Fetches `https://status.robertsspaceindustries.com/index.xml`
- Parses RSS/XML into a typed status model
- Displays recent updates with title, summary, publish time, category, link, and inferred service level
- Includes manual refresh and automatic refresh every five minutes
- Shows loading and error states
- Caches the last successful feed in local storage
- Browses ships and ground vehicles with filters, detailed specifications, and in-game purchase or rental locations
- Browses ship systems, weapons, and utility components with filters, technical specifications, and in-game shop prices
- Combines Star Citizen Wiki game data with UEX market and location data
- Browses all reported commodity markets with name, system, location, and availability filters plus sortable buy, sell, stock, demand, and freshness columns
- Plans commodity routes using ship cargo capacity, optional available funds, origin and destination systems or terminals, with strict terminal autoload eligibility plus resilient estimated travel, loading/unloading fees, handling time, and total route time
- Applies ship-specific cargo access rules; Hull C, D, and E profiles require terminals with both docking and dedicated external loading facilities
- Excludes concept ships from route planning so selectable ships represent currently usable cargo capacity
- Requires purchase and drop-off reports to share at least one verified container size and rounds route quantities to a packable amount
- Shows purchase, drop-off, and shared container-size options on every expanded route
- Ranks viable routes by total profit, ROI, unit margin, or cargo moved, with expandable purchase and sale calculations
- Refreshes UEX commodity markets every 30 minutes and keeps the last successful snapshot available locally
- Watches the active Star Citizen `Game.log` and imports previous files from `logbackups`
- Organizes captured events into sessions with timeline, search, category filters, totals, and expandable raw details
- Makes every Live Sessions total clickable, with full-history grouped breakdowns and expandable source records
- Makes every grouped Live Sessions row clickable for a second-level, paginated list of its matching events and complete captured details
- Retains unknown tagged events so newly introduced log data remains available before the parser is updated
- Stores gameplay history only in the app's local SQLite database and redacts common account, session, authentication, and email fields
- Shows persistent unread indicators on News, Patch Notes, and Server Status categories and entries until each update is opened
- Keeps each feed in a dedicated module so SC Companion can grow without coupling unrelated features
- Configures Tauri bundles for Windows MSI/NSIS and Linux deb/rpm/AppImage outputs
- Checks GitHub Releases for signed updates, notifies the user, and installs updates inside the app

## Project Structure

### Player Marketplace

Player Marketplace imports item buy and sell listings from the public UEX marketplace API,
with seller lookup, persistent filters, expandable descriptions/photos, price sorting,
local caching, WTS/WTB labels and transaction filtering, and refresh every five minutes while the section is open. Feed results
are capped by UEX; search and Show more operate on the loaded snapshot, not the entire
catalog. Seller asks and availability are not verified transaction prices or guarantees.
Purchases and seller contact are handled on the source website.

SC Market is currently an external link only. Add future supported listing feeds through
the provider interface in `src/playerMarketplace/service.ts` and register attribution
in `src/dataSources.ts`. Keep provider IDs, currencies, and source links distinct.

```text
src/
  App.tsx
  status/
    cache.ts
    rss.ts
    statusService.ts
    types.ts
    useStatusFeed.ts
  ships/
  componentsDatabase/
  tradeRoutes/
  gameplay/
src-tauri/
  capabilities/default.json
  src/
    gameplay.rs
  tauri.conf.json
```

## Prerequisites

Install these once on your development machine.

### Windows

1. Install Node.js LTS from `https://nodejs.org/`.
2. Install Rust through rustup:

   ```powershell
   winget install --id Rustlang.Rustup
   ```

3. Install Microsoft C++ Build Tools and select the `Desktop development with C++` workload.
4. Confirm Microsoft Edge WebView2 Runtime is installed. It is already present on most Windows 10 and Windows 11 systems.
5. For MSI builds, make sure the Windows `VBSCRIPT` optional feature is enabled if the MSI toolchain reports `failed to run light.exe`.

### Linux

1. Install Node.js LTS.
2. Install Rust:

   ```bash
   curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
   ```

3. Install Tauri Linux system dependencies. On Debian/Ubuntu:

   ```bash
   sudo apt update
   sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
   ```

4. Install package helpers for Linux bundles as needed:

   ```bash
   sudo apt install -y rpm
   ```

## Local Commands

Install JavaScript dependencies:

```bash
npm install
```

Run the web UI only:

```bash
npm run dev
```

Run the desktop app:

```bash
npm run tauri:dev
```

Build the web frontend:

```bash
npm run build:web
```

Build desktop packages:

```bash
npm run tauri:build
```

Build outputs are written under:

```text
src-tauri/target/release/bundle/
```

On Windows, the configured targets are MSI and NSIS setup executable. On Linux, the configured targets are Debian package, RPM package, and AppImage. Build each platform on that operating system first; cross-compiling is possible but is better handled later in CI once the app has real release needs.

## GitHub Releases and Updates

The release workflow in `.github/workflows/release.yml` builds Windows and Linux packages on GitHub. It also publishes the signed updater manifest used by installed copies of SC Companion.

Repository setup requires one Actions secret named `TAURI_SIGNING_PRIVATE_KEY`. Never commit the private key. The matching public key is embedded in `src-tauri/tauri.conf.json`; changing that public key would prevent existing installations from accepting later releases.

To publish a release, update the same version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`, commit the change, then push a matching tag such as:

```bash
git tag v0.30.0
git push origin main
git push origin v0.30.0
```

The first updater-enabled version must be installed manually. After that bootstrap install, SC Companion checks for updates after launch and every four hours while it remains in the system tray. Users can also check from **Settings > Application updates**.

## Live Sessions

Open **Live Sessions** from the home screen. SC Companion automatically looks for `Game.log` in common LIVE, PTU, EPTU, HOTFIX, and TECH-PREVIEW install folders. Use **Log source** to enter a different game folder or exact `Game.log` path when needed.

The tracker reads only new bytes from the active log while the app is running and imports historical `.log` files from the adjacent `logbackups` folder in the background. Closing the main window to the tray keeps capture active. Session history is stored in `gameplay.sqlite3` inside the operating system's app-data folder and is not uploaded by SC Companion.

## Next Good Steps

- Add multi-stop and return-trip route planning.
- Move the larger ship and component catalogs from local storage to SQLite.
- Add code signing certificates for stronger Windows SmartScreen trust.
