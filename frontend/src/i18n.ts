import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import da from './locales/da.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import it from './locales/it.json';
import es from './locales/es.json';

export const SUPPORTED_LANGUAGES: string[] = ['en', 'da', 'de', 'fr', 'it', 'es'];

const resources: Record<string, { translation: object }> = {
  en: { translation: en },
  da: { translation: da },
  de: { translation: de },
  fr: { translation: fr },
  it: { translation: it },
  es: { translation: es },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: localStorage.getItem('language') || 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React handles XSS
    },
  });

export default i18n;
