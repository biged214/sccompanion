import i18next from 'i18next';
import { useSyncExternalStore } from 'react';
import { fr } from './fr';

export type Language = 'en' | 'fr';
export const LANGUAGE_KEY = 'sc-companion:language';
function initialLanguage(): Language {
  try { return localStorage.getItem(LANGUAGE_KEY) === 'fr' ? 'fr' : 'en'; }
  catch { return 'en'; }
}
export const i18n = i18next.createInstance();
void i18n.init({
  lng: initialLanguage(), fallbackLng: 'en', supportedLngs: ['en', 'fr'],
  keySeparator: false, nsSeparator: false, initAsync: false,
  interpolation: { escapeValue: false },
  resources: { en: { translation: Object.fromEntries(Object.keys(fr).map(key => [key, key])) }, fr: { translation: fr } }
});
export function t(message: string, values?: Record<string, string | number>): string {
  return i18n.t(message, { ...values, defaultValue: message }) as string;
}
export function locale(): string { return i18n.language === 'fr' ? 'fr-FR' : 'en-US'; }
export function setLanguage(language: Language): void {
  try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* In-memory selection still works. */ }
  void i18n.changeLanguage(language);
}
function subscribe(callback: () => void) {
  i18n.on('languageChanged', callback);
  return () => { i18n.off('languageChanged', callback); };
}
export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, () => i18n.language === 'fr' ? 'fr' : 'en', () => 'en');
}
function updateDocumentLanguage() {
  if (typeof document !== 'undefined') document.documentElement.lang = i18n.language;
}
i18n.on('languageChanged', updateDocumentLanguage);
updateDocumentLanguage();
