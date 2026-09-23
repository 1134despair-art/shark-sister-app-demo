import type { LocaleCode } from '@/types/models'

export interface AppLocaleOption {
  code: LocaleCode
  nativeName: string
  nameZh: string
  nameEn: string
  shortCode: string
  direction: 'ltr' | 'rtl'
}

export const appLocales: readonly AppLocaleOption[] = [
  { code: 'zh-Hans', nativeName: '简体中文', nameZh: '中文', nameEn: 'Chinese (Simplified)', shortCode: 'ZH', direction: 'ltr' },
  { code: 'en', nativeName: 'English', nameZh: '英文', nameEn: 'English', shortCode: 'EN', direction: 'ltr' },
  { code: 'ko', nativeName: '한국어', nameZh: '韩语', nameEn: 'Korean', shortCode: 'KO', direction: 'ltr' },
  { code: 'ja', nativeName: '日本語', nameZh: '日语', nameEn: 'Japanese', shortCode: 'JA', direction: 'ltr' },
  { code: 'tr', nativeName: 'Türkçe', nameZh: '土耳其语', nameEn: 'Turkish', shortCode: 'TR', direction: 'ltr' },
  { code: 'ar', nativeName: 'العربية', nameZh: '阿拉伯语', nameEn: 'Arabic', shortCode: 'AR', direction: 'rtl' },
  { code: 'pt', nativeName: 'Português', nameZh: '葡萄牙语', nameEn: 'Portuguese', shortCode: 'PT', direction: 'ltr' },
  { code: 'es', nativeName: 'Español', nameZh: '西班牙语', nameEn: 'Spanish', shortCode: 'ES', direction: 'ltr' },
  { code: 'fr', nativeName: 'Français', nameZh: '法语', nameEn: 'French', shortCode: 'FR', direction: 'ltr' },
  { code: 'de', nativeName: 'Deutsch', nameZh: '德语', nameEn: 'German', shortCode: 'DE', direction: 'ltr' },
  { code: 'it', nativeName: 'Italiano', nameZh: '意大利语', nameEn: 'Italian', shortCode: 'IT', direction: 'ltr' },
  { code: 'nl', nativeName: 'Nederlands', nameZh: '荷兰语', nameEn: 'Dutch', shortCode: 'NL', direction: 'ltr' },
  { code: 'ru', nativeName: 'Русский', nameZh: '俄语', nameEn: 'Russian', shortCode: 'RU', direction: 'ltr' },
] as const

const localeCodes = new Set<string>(appLocales.map((item) => item.code))

export function isSupportedLocale(value: unknown): value is LocaleCode {
  return typeof value === 'string' && localeCodes.has(value)
}

export function getLocaleOption(locale: LocaleCode): AppLocaleOption {
  return appLocales.find((item) => item.code === locale) || appLocales[0]
}

export function runtimeLocaleFor(locale: LocaleCode): 'zh-Hans' | 'en' {
  return locale === 'zh-Hans' ? 'zh-Hans' : 'en'
}

export function localeDirection(locale: LocaleCode): 'ltr' | 'rtl' {
  return getLocaleOption(locale).direction
}
