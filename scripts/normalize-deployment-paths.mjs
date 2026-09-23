import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'

const output = resolve(process.argv[2] || 'dist/build/h5')
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.svg'])
const rootAsset = /([`"'(=:\s])\/(assets|static)\//g

async function filesIn(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await filesIn(path))
    else files.push(path)
  }
  return files
}

let changed = 0
for (const file of await filesIn(output)) {
  const extension = extname(file).toLowerCase()
  if (!textExtensions.has(extension)) continue
  const content = await readFile(file, 'utf8')
  const cssBase = relative(dirname(file), output).replaceAll('\\', '/') || '.'
  const assetBase = extension === '.css' ? cssBase : '.'
  const normalized = content.replace(rootAsset, (_match, prefix, directory) => `${prefix}${assetBase}/${directory}/`)
  if (normalized === content) continue
  await writeFile(file, normalized)
  changed += 1
}

console.log(`已将 ${changed} 个构建文件转换为相对资源路径`)
