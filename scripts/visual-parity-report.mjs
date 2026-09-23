import { createRequire } from 'node:module'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const pnpmDirectory = resolve('node_modules', '.pnpm')
const packages = await readdir(pnpmDirectory)
const pixelmatchPackage = packages.find((name) => name.startsWith('pixelmatch@'))
const pngjsPackage = packages.find((name) => name.startsWith('pngjs@'))
if (!pixelmatchPackage || !pngjsPackage) throw new Error('Pixelmatch report dependencies are unavailable')
const pixelmatch = require(resolve(pnpmDirectory, pixelmatchPackage, 'node_modules', 'pixelmatch'))
const { PNG } = require(resolve(pnpmDirectory, pngjsPackage, 'node_modules', 'pngjs'))

const expectedDirectory = resolve('..', 'ui-design', 'exports', 'screens')
const actualDirectory = resolve('artifacts', 'visual-parity', 'actual')
const diffDirectory = resolve('artifacts', 'visual-parity', 'diff')
const reportDirectory = resolve('artifacts', 'visual-parity')
await mkdir(diffDirectory, { recursive: true })

const derivedIds = new Set(['H02', 'D10', 'D11', 'D12', 'D13'])
const extendedIds = new Set(['H04', 'H05', 'D09', 'B16', 'B29'])
const scopeFor = (id) => derivedIds.has(id) ? 'derived' : extendedIds.has(id) ? 'extended' : 'required'

const expectedFiles = (await readdir(expectedDirectory)).filter((name) => /^[A-Z]\d{2}\.png$/.test(name)).sort()
const actualFiles = (await readdir(actualDirectory)).filter((name) => /^[A-Z]\d{2}\.png$/.test(name)).sort()
if (expectedFiles.length !== 115 || actualFiles.length !== 115) throw new Error(`Expected 115 baseline and actual files, got ${expectedFiles.length}/${actualFiles.length}`)
if (expectedFiles.join('|') !== actualFiles.join('|')) throw new Error('Baseline and App screenshot file sets differ')

const results = []
for (const file of expectedFiles) {
  const id = file.slice(0, -4)
  const expected = PNG.sync.read(await readFile(resolve(expectedDirectory, file)))
  const actual = PNG.sync.read(await readFile(resolve(actualDirectory, file)))
  if (expected.width !== 390 || expected.height !== 844 || actual.width !== 390 || actual.height !== 844) throw new Error(`${id}: expected two 390x844 images`)
  const diff = new PNG({ width: 390, height: 844 })
  const diffPixels = pixelmatch(expected.data, actual.data, diff.data, 390, 844, { threshold: 0.2, includeAA: false })
  const totalPixels = 390 * 844
  const diffRatio = diffPixels / totalPixels
  const similarity = 1 - diffRatio
  await writeFile(resolve(diffDirectory, file), PNG.sync.write(diff))
  results.push({ id, scope: scopeFor(id), width: 390, height: 844, diffPixels, diffRatio, similarity, passed: similarity >= 0.98, expected: `../../../ui-design/exports/screens/${file}`, actual: `actual/${file}`, diff: `diff/${file}` })
}

const failed = results.filter((item) => !item.passed)
const summary = {
  generatedAt: new Date().toISOString(),
  algorithm: { name: 'pixelmatch', threshold: 0.2, includeAA: false, formula: '1 - diffPixels / (390 * 844)', requiredSimilarity: 0.98 },
  counts: {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    required: results.filter((item) => item.scope === 'required').length,
    derived: results.filter((item) => item.scope === 'derived').length,
    extended: results.filter((item) => item.scope === 'extended').length,
  },
  minimumSimilarity: Math.min(...results.map((item) => item.similarity)),
  results,
}
if (summary.counts.required !== 105 || summary.counts.derived !== 5 || summary.counts.extended !== 5) throw new Error(`Unexpected scope counts: ${JSON.stringify(summary.counts)}`)
await writeFile(resolve(reportDirectory, 'parity-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

const rows = results.map((item) => `<tr><td>${item.id}</td><td>${item.scope}</td><td>${(item.similarity * 100).toFixed(4)}%</td><td>${item.diffPixels}</td><td><img src="${item.expected}" alt="${item.id} expected"></td><td><img src="${item.actual}" alt="${item.id} actual"></td><td><img src="${item.diff}" alt="${item.id} diff"></td></tr>`).join('\n')
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>鲨鱼妹妹 115 页视觉对齐报告</title><style>body{margin:0;padding:24px;font-family:Arial,"Microsoft YaHei",sans-serif;color:#121722;background:#eef2f7}h1{margin:0 0 8px;font-size:24px}p{margin:0 0 20px;color:#475467}table{width:100%;border-collapse:collapse;background:#fff}th,td{padding:10px;border:1px solid #d8dfea;text-align:left;vertical-align:top}th{position:sticky;top:0;background:#f7f9fc}img{width:130px;height:auto;display:block}tr:nth-child(even){background:#fbfbfd}</style></head><body><h1>鲨鱼妹妹 115 页视觉对齐报告</h1><p>通过 ${summary.counts.passed}/${summary.counts.total}；最低相似度 ${(summary.minimumSimilarity * 100).toFixed(4)}%；Pixelmatch threshold=0.2，ignoreAA，390×844。</p><table><thead><tr><th>ID</th><th>Scope</th><th>Similarity</th><th>Diff pixels</th><th>Design</th><th>App</th><th>Diff</th></tr></thead><tbody>${rows}</tbody></table></body></html>`
await writeFile(resolve(reportDirectory, 'parity-summary.html'), html, 'utf8')
if (failed.length) throw new Error(`${failed.length} screens are below 98%: ${failed.map((item) => item.id).join(', ')}`)
console.log(`Visual parity report: ${results.length}/${results.length} passed; minimum ${(summary.minimumSimilarity * 100).toFixed(4)}%`)
