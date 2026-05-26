import plCommon from '../locales/pl/common.json';
import deCommon from '../locales/de/common.json';
import enCommon from '../locales/en/common.json';

export const resources = {
  pl: { common: plCommon },
  de: { common: deCommon },
  en: { common: enCommon },
} as const;

export const supportedLngs = ['pl', 'de', 'en'] as const;
export const defaultNS = 'common' as const;
