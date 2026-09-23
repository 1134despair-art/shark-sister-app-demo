import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { backgroundAssets, brandAssets, iconAssets, iconTones, resolveIconAsset, resolveIconTone } from '@/config/iconAssets'
import { resolveIconfontGlyph } from '@/config/iconfontMap'
import { resolveIconfontVector } from '@/config/iconfontVectorMap'

const projectRoot = resolve(__dirname, '..')
const assetRoot = resolve(projectRoot, 'src', 'static', 'assest')
const manifest = JSON.parse(readFileSync(resolve(assetRoot, 'manifest.json'), 'utf8'))

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const item = join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(item) : [item]
  })
}

function attributeOptions(tag: string, attribute: string, allowedValues: Set<string>): string[] {
  const staticValue = tag.match(new RegExp(`(?<!:)\\b${attribute}=["']([^"']+)["']`))?.[1]
  if (staticValue) return [staticValue]
  const expression = tag.match(new RegExp(`:${attribute}="([^"]*)"`))?.[1]
    || tag.match(new RegExp(`:${attribute}='([^']*)'`))?.[1]
  if (!expression) return []
  return [...new Set(
    [...expression.matchAll(/["'`]([^"'`]+)["'`]/g)]
      .map((match) => match[1])
      .filter((value) => allowedValues.has(value)),
  )]
}

describe('local icon asset contract', () => {
  it('matches the generated manifest inventory', () => {
    expect(Object.keys(iconAssets)).toHaveLength(152)
    expect(manifest.counts.iconNames).toBe(152)
    expect(manifest.counts.iconVariants).toBe(manifest.icons.reduce((sum: number, icon: { variants: unknown[] }) => sum + icon.variants.length, 0))
    expect(manifest.counts.iconVariants).toBeGreaterThanOrEqual(290)
    expect(iconTones).toHaveLength(13)
    expect(manifest.tones).toEqual(Object.fromEntries(iconTones.map((tone) => [tone, expect.any(String)])))
  })

  it('indexes every brand and background asset copied from the design library', () => {
    expect(Object.keys(brandAssets)).toHaveLength(manifest.brand.length)
    expect(Object.keys(backgroundAssets)).toHaveLength(manifest.backgrounds.length)
    for (const path of [...Object.values(brandAssets), ...Object.values(backgroundAssets)]) {
      expect(path).toMatch(/^\/(?:src\/)?static\/assest\/.+\.png$/)
      expect(existsSync(resolve(assetRoot, path.replace(/^\/(?:src\/)?static\/assest\//, '')))).toBe(true)
    }
  })

  it('resolves every declared tone to an existing transparent PNG path', () => {
    for (const [name, icon] of Object.entries(iconAssets)) {
      expect(icon.tones.length).toBeGreaterThan(0)
      for (const tone of icon.tones) {
        const webPath = resolveIconAsset(name, tone)
        expect(webPath).toMatch(new RegExp(`/icons/variants/${name}--${tone}\\.png$`))
        expect(existsSync(resolve(assetRoot, webPath.replace(/^\/(?:src\/)?static\/assest\//, '')))).toBe(true)
      }
    }
  })

  it('uses a deterministic icon-specific fallback for unavailable tones', () => {
    expect(resolveIconTone('apple', 'danger')).toBe(iconAssets.apple.defaultTone)
    expect(resolveIconAsset('apple', 'danger')).toContain(`apple--${iconAssets.apple.defaultTone}.png`)
    expect(resolveIconAsset('unknown-icon')).toMatch(/\/icons\/variants\/circle-help--default\.png$/)
  })

  it('renders semantic and decorative accessibility attributes without CSS masks', () => {
    const source = readFileSync(resolve(projectRoot, 'src', 'components', 'SsIcon.vue'), 'utf8')
    expect(source).toContain('ss-iconfont')
    expect(source).toContain('ss-iconfont-vector')
    expect(source).toContain('<image')
    expect(source).toContain(':aria-label="alt || undefined"')
    expect(source).toContain(':aria-hidden="alt ? undefined : \'true\'"')
    expect(source).not.toMatch(/maskImage|WebkitMaskImage/)
  })

  it('uses an explicit tone on every SsIcon call site', () => {
    for (const file of sourceFiles(resolve(projectRoot, 'src')).filter((item) => extname(item) === '.vue')) {
      const source = readFileSync(file, 'utf8')
      for (const tag of source.match(/<SsIcon\b[\s\S]*?\/>/g) || []) {
        expect(tag, `${file} has an implicit icon tone`).toMatch(/(?:^|\s):?tone=/)
      }
    }
  })

  it('resolves every SsIcon call site through Iconfont or an exact PNG fallback', () => {
    const registeredNames = new Set(Object.keys(iconAssets))
    const registeredTones = new Set<string>(iconTones)
    for (const file of sourceFiles(resolve(projectRoot, 'src')).filter((item) => extname(item) === '.vue')) {
      const source = readFileSync(file, 'utf8')
      for (const tag of source.match(/<SsIcon\b[\s\S]*?\/>/g) || []) {
        const names = attributeOptions(tag, 'name', registeredNames)
        const tones = attributeOptions(tag, 'tone', registeredTones)
        for (const name of names) {
          for (const tone of tones) {
            if (resolveIconfontGlyph(name) || resolveIconfontVector(name)) continue
            expect(iconAssets[name as keyof typeof iconAssets]?.tones, `${file} requests missing ${name}--${tone}.png`).toContain(tone)
            expect(existsSync(resolve(assetRoot, 'icons', 'variants', `${name}--${tone}.png`))).toBe(true)
          }
        }
      }
    }
  })

  it('bundles the selected Iconfont locally and maps the main product semantics', () => {
    expect(existsSync(resolve(projectRoot, 'src', 'static', 'iconfont', 'iconfont.ttf'))).toBe(true)
    for (const name of ['panels-top-left', 'store', 'ship', 'map-pinned', 'wrench', 'package', 'truck', 'wallet-cards', 'lock-keyhole', 'search', 'bell', 'settings-2']) {
      expect(resolveIconfontGlyph(name), `${name} should use the local Iconfont`).toBeDefined()
    }
    expect(resolveIconfontVector('bluetooth')).toMatchObject({ sourceId: 14464821, viewBox: '0 0 1024 1024' })
    expect(resolveIconfontVector('propeller')).toMatchObject({ sourceId: 22619802, viewBox: '0 0 1024 1024' })
  })

  it('only references registered literal icon names in Vue templates', () => {
    const registered = new Set(Object.keys(iconAssets))
    const uniToastIcons = new Set(['none', 'success', 'error', 'loading'])
    for (const file of sourceFiles(resolve(projectRoot, 'src')).filter((item) => extname(item) === '.vue')) {
      const source = readFileSync(file, 'utf8')
      const template = source.match(/<template>([\s\S]*?)<\/template>/)?.[1] || ''
      const names = [
        ...Array.from(template.matchAll(/<SsIcon\b[^>]*\sname=["']([^"']+)["']/g), (match) => match[1]),
        ...Array.from(template.matchAll(/\bicon\s*:\s*["']([^"']+)["']/g), (match) => match[1]),
      ]
      for (const name of names.filter((item) => !uniToastIcons.has(item))) {
        expect(registered.has(name) || Boolean(resolveIconfontGlyph(name)) || Boolean(resolveIconfontVector(name)), `${file} references unknown icon ${name}`).toBe(true)
      }
    }
  })
})
