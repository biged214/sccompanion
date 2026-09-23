# Interface Languages

English is the default. Select Settings > Language to use Français or Español.
The choice is stored locally under `sc-companion:language` and applied on startup,
including the native tray menu. Changing language does not remount screens or
change saved filters, selections, article read state, or cached source data.

## Adding UI Text

- Wrap app-owned labels with `t('English message')` and add the same key to `fr.ts`.
- Use interpolation for dynamic text: `t('Size {{v0}}', { v0: size })`.
- Use `locale()` for date and number formatting, never for parsing input values.
- Translate at render time, not while constructing cached data or module-level constants.
- Keep option values, identifiers, search terms, and persisted state independent
  of translations. An option should have an explicit stable `value`.
- Do not translate API article bodies, item names, locations, player content,
  or raw logs. Detailed source-provided descriptions and technical errors may
  remain in their original language. Missing translations fall back to English.
- Register additional languages in `index.ts` and the Settings selector; add the
  native tray labels to `src-tauri/src/lib.rs`.

## Verification

Run `node tests/i18n.mjs`, `node tests/french-browser.mjs`, and
`npm run build:web`. The browser test uses installed Chrome and temporary port
1435. It tests switching, persistence, stable filters, and responsive layouts.
Run `cargo check --manifest-path src-tauri/Cargo.toml --locked` for native changes.
