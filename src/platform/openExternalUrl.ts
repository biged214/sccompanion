export async function openExternalUrl(url: string): Promise<void> {
  if (!window.__TAURI_INTERNALS__) {
    return;
  }

  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(url);
}
