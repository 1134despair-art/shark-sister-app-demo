import { readdir, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from '../../spreadsheet_work/node_modules/sharp/dist/index.mjs'

const sourceDir = resolve('..', 'ui-design', 'exports', 'screens')
const outputDir = resolve('artifacts', 'ui-review', 'contact-sheets')
const groups = ['A', 'H', 'D', 'M', 'P', 'S', 'B', 'X']
const columns = 4
const chunkSize = 12
const tileWidth = 205
const tileHeight = 450
const imageWidth = 195
const imageHeight = 422

await mkdir(outputDir, { recursive: true })
const files = (await readdir(sourceDir)).filter((file) => file.endsWith('.png')).sort()

for (const group of groups) {
  const grouped = files.filter((file) => file.startsWith(group))
  for (let start = 0; start < grouped.length; start += chunkSize) {
    const chunk = grouped.slice(start, start + chunkSize)
    const rows = Math.ceil(chunk.length / columns)
    const composites = []

    for (const [index, file] of chunk.entries()) {
      const left = (index % columns) * tileWidth + 5
      const top = Math.floor(index / columns) * tileHeight + 23
      const screenshot = await sharp(resolve(sourceDir, file))
        .resize(imageWidth, imageHeight, { fit: 'contain', background: '#eef2f7' })
        .png()
        .toBuffer()
      const label = file.replace('.png', '')
      const labelSvg = Buffer.from(`<svg width="${imageWidth}" height="20" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#ffffff"/><text x="4" y="15" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#182230">${label}</text></svg>`)
      composites.push({ input: labelSvg, left, top: top - 20 })
      composites.push({ input: screenshot, left, top })
    }

    const part = Math.floor(start / chunkSize) + 1
    await sharp({
      create: {
        width: columns * tileWidth,
        height: rows * tileHeight,
        channels: 4,
        background: '#e8edf4',
      },
    })
      .composite(composites)
      .png()
      .toFile(resolve(outputDir, `${group}-${part}.png`))
  }
}

console.log(`Contact sheets written to ${outputDir}`)
