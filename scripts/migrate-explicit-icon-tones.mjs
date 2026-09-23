import { readdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map((entry) => entry.isDirectory() ? walk(join(directory, entry.name)) : join(directory, entry.name)))
  return files.flat()
}

let updatedFiles = 0
let updatedIcons = 0
for (const file of (await walk('src')).filter((item) => extname(item) === '.vue')) {
  const source = await readFile(file, 'utf8')
  let fileIcons = 0
  const updated = source.replace(/<SsIcon\b[\s\S]*?\/>/g, (tag) => {
    if (/(?:^|\s):?tone=/.test(tag)) return tag
    fileIcons += 1
    return tag.replace(/\s*\/>$/, ' tone="default" />')
  })
  if (fileIcons) {
    await writeFile(file, updated, 'utf8')
    updatedFiles += 1
    updatedIcons += fileIcons
  }
}

console.log(`Added explicit default tones to ${updatedIcons} icons across ${updatedFiles} Vue files.`)
