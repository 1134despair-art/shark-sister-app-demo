import { describe, expect, it } from 'vitest'
import { appLocales, getLocaleOption, isSupportedLocale, localeDirection, runtimeLocaleFor } from '@/config/locales'

describe('application locales', () => {
  it('registers the 13 requested languages with unique standard codes', () => {
    expect(appLocales).toHaveLength(13)
    expect(new Set(appLocales.map((item) => item.code)).size).toBe(13)
    expect(appLocales.map((item) => item.code)).toEqual(['zh-Hans', 'en', 'ko', 'ja', 'tr', 'ar', 'pt', 'es', 'fr', 'de', 'it', 'nl', 'ru'])
    expect(appLocales.every((item) => isSupportedLocale(item.code))).toBe(true)
  })

  it('uses English as the complete fallback and enables RTL for Arabic', () => {
    expect(runtimeLocaleFor('zh-Hans')).toBe('zh-Hans')
    expect(runtimeLocaleFor('ja')).toBe('en')
    expect(runtimeLocaleFor('ar')).toBe('en')
    expect(localeDirection('ar')).toBe('rtl')
    expect(localeDirection('ru')).toBe('ltr')
    expect(getLocaleOption('ko').nativeName).toBe('한국어')
  })
})
