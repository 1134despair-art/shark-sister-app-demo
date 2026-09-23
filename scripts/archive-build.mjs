import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const variant = process.argv[2]
if (!['cn', 'global'].includes(variant)) throw new Error('Expected build variant: cn or global')
const platform = process.argv[3] || 'h5'
if (!['h5', 'app'].includes(platform)) throw new Error('Expected platform: h5 or app')
const source = resolve(root, 'dist', 'build', platform)
const target = resolve(root, 'dist', 'releases', `${platform}-${variant}`)
await rm(target, { recursive: true, force: true })
await mkdir(dirname(target), { recursive: true })
await cp(source, target, { recursive: true })
console.log(`Archived ${platform} ${variant} build to ${target}`)
