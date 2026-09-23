import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'

const output = resolve(process.argv[2] || 'dist/build/h5')
const allowed = new Set([
  '.css', '.gif', '.html', '.ico', '.jpeg', '.jpg', '.js', '.json', '.mp3',
  '.mp4', '.ogg', '.pdf', '.png', '.svg', '.ttf', '.wav', '.webm', '.webp',
  '.woff', '.woff2',
])
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.svg'])
const forbidden = [
  { label: '站点根路径 /assets', pattern: /(?:["'(=]|url\()\s*\/assets\// },
  { label: '站点根路径 /static', pattern: /(?:["'(=]|url\()\s*\/static\// },
  { label: '本地服务地址', pattern: /(?:localhost|127\.0\.0\.1)/i },
  { label: 'Windows 绝对路径', pattern: /[A-Za-z]:\\/ },
]
const cssUrl = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g

async function filesIn(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await filesIn(path))
    else files.push(path)
  }
  return files
}

if (!(await stat(join(output, 'index.html')).catch(() => null))?.isFile()) {
  throw new Error(`构建产物缺少 index.html: ${output}`)
}

const problems = []
for (const file of await filesIn(output)) {
  const extension = extname(file).toLowerCase()
  const relative = file.slice(output.length + 1)
  if (!allowed.has(extension)) problems.push(`${relative}: 不允许的文件类型 ${extension || '(无扩展名)'}`)
  if (!textExtensions.has(extension)) continue
  const content = await readFile(file, 'utf8')
  for (const rule of forbidden) if (rule.pattern.test(content)) problems.push(`${relative}: ${rule.label}`)
  if (extension !== '.css') continue
  for (const match of content.matchAll(cssUrl)) {
    const reference = match[2].trim()
    if (/^(?:data:|https?:|#)/i.test(reference)) continue
    const pathname = decodeURIComponent(reference.split(/[?#]/, 1)[0])
    const target = resolve(dirname(file), pathname)
    if (!(await stat(target).catch(() => null))?.isFile()) {
      problems.push(`${relative}: CSS 资源不存在 ${reference}`)
    }
  }
}

if (problems.length) throw new Error(`部署产物检查失败:\n${problems.join('\n')}`)
console.log(`部署产物检查通过: ${output}`)
