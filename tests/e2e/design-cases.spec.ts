import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { designCaseRegistry } from '../../src/config/designCases'

const selectedIds = new Set((process.env.DESIGN_CASE_IDS || '').split(',').map((id) => id.trim()).filter(Boolean))
const visualCases = selectedIds.size ? designCaseRegistry.filter((item) => selectedIds.has(item.id)) : designCaseRegistry
const actualDirectory = resolve('artifacts', 'visual-parity', 'actual')
mkdirSync(actualDirectory, { recursive: true })

test.describe('115 UI design states at the 390 x 844 reference viewport', () => {
  for (const item of visualCases) {
    test(`${item.id} ${item.title}`, async ({ page }, testInfo) => {
      await page.goto(`/#/pages/design-case/index?id=${item.id}&parity=0`)
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' })
      await page.waitForTimeout(item.module === 'dialog' ? 250 : 700)
      await expect(page.locator('.ss-design-parity')).toHaveCount(0)
      await expect(page.locator('body')).not.toBeEmpty()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      if (process.env.GLOBAL_AUDIT === '1') {
        const visibleText = await page.locator('body').innerText()
        expect(visibleText.match(/[\u4e00-\u9fff]+/g), `${item.id} contains untranslated visible text`).toBeNull()
      }
      const screenshot = await page.screenshot({ path: resolve(actualDirectory, `${item.id}.png`), fullPage: false })
      expect(screenshot).toMatchSnapshot(`${item.id}.png`, { threshold: 0.2, maxDiffPixelRatio: 0.02 })
    })
  }
})
