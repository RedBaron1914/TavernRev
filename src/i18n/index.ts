import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { locale } from '@tauri-apps/plugin-os';

export const NAMESPACES = ['common', 'chat', 'settings', 'editor', 'backend'];
export const DEFAULT_LANGUAGE = 'en';

// Dynamic loader - picks up any folder in locales/
async function loadResources(lng: string) {
  const resources: Record<string, object> = {};
  for (const ns of NAMESPACES) {
    try {
      // Use Vite's dynamic import
      const module = await import(`./locales/${lng}/${ns}.json`);
      resources[ns] = module.default;
    } catch {
      // If file not found, we just skip it (it will fallback to English)
    }
  }
  return resources;
}

// Automatically discover available languages from folder names
const localeModules = import.meta.glob('./locales/*/common.json');
export const AVAILABLE_LANGUAGES = Object.keys(localeModules).map(
  (path) => path.match(/\.\/locales\/(.+?)\//)?.[1] || DEFAULT_LANGUAGE
);

async function detectSystemLocale(): Promise<string> {
  try {
    const sysLocale = await locale(); // "en-US", "ru-RU", etc.
    return sysLocale?.split('-')[0] ?? DEFAULT_LANGUAGE;
  } catch {
    return navigator.language?.split('-')[0] ?? DEFAULT_LANGUAGE;
  }
}

export async function initI18n() {
  // Load saved language or detect system language
  const savedLng = localStorage.getItem('i18nextLng');
  const lng = savedLng || await detectSystemLocale();
  
  // Always load English as fallback
  const enResources = await loadResources(DEFAULT_LANGUAGE);
  
  // Load the target language resources
  const lngResources = lng !== DEFAULT_LANGUAGE ? await loadResources(lng) : enResources;

  await i18n.use(initReactI18next).init({
    lng,
    fallbackLng: DEFAULT_LANGUAGE,
    defaultNS: 'common',
    ns: NAMESPACES,
    resources: {
      [DEFAULT_LANGUAGE]: enResources,
      [lng]: lngResources,
    },
    interpolation: {
      escapeValue: false, // React already escapes values
    },
  });

  // Listener to save language preference on change
  i18n.on('languageChanged', async (newLng) => {
    localStorage.setItem('i18nextLng', newLng);
    
    // Load resources for the newly selected language if they aren't loaded yet
    if (!i18n.hasResourceBundle(newLng, 'common')) {
        const newResources = await loadResources(newLng);
        Object.entries(newResources).forEach(([ns, data]) => {
            i18n.addResourceBundle(newLng, ns, data, true, true);
        });
    }
  });
}

export default i18n;
