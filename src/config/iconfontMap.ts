export interface IconfontGlyph {
  char: string
  className?: string
  rotate?: number
}

const glyph = {
  user: '\ue677',
  fastForward: '\ue939',
  help: '\ue93b',
  info: '\ue93c',
  left: '\ue93d',
  download: '\ue93a',
  link: '\ue93e',
  pause: '\ue93f',
  inbox: '\ue940',
  right: '\ue941',
  up: '\ue942',
  upload: '\ue943',
  refresh: '\ue944',
  wifi: '\ue945',
  folder: '\ue946',
  loading: '\ue947',
  view: '\ue948',
  share: '\ue949',
  lock: '\ue94a',
  shuffle: '\ue94b',
  down: '\ue94c',
  play: '\ue94d',
  settings: '\ue94e',
  search: '\ue94f',
  calendar: '\ue950',
  device: '\ue655',
  power: '\ue87b',
  store: '\ue87e',
  ship: '\ue6f4',
  home: '\ue627',
  message: '\ue69e',
  edit: '\ue615',
  staff: '\ue841',
  warning: '\ue636',
  package: '\ue609',
  route: '\ue637',
  repair: '\ue66f',
  location: '\ue65e',
  bell: '\ue605',
  success: '\ue60d',
  pictureSearch: '\ue860',
  plus: '\ue612',
  map: '\ue678',
  camera: '\ue604',
  chart: '\ue654',
  truck: '\ue69c',
  phone: '\ueaa8',
  fan: '\ue697',
  payment: '\ue68c',
} as const

const exact: Record<string, IconfontGlyph> = {
  'arrow-left': { char: glyph.left },
  'chevron-left': { char: glyph.left },
  'arrow-right': { char: glyph.right },
  'chevron-right': { char: glyph.right },
  'arrow-up': { char: glyph.up },
  'arrow-down': { char: glyph.down },
  'chevron-down': { char: glyph.down },
  x: { char: glyph.plus, rotate: 45 },
  play: { char: glyph.play },
  pause: { char: glyph.pause },
  'circle-pause': { char: glyph.pause },
  forward: { char: glyph.fastForward },
  download: { char: glyph.download },
  'upload-cloud': { char: glyph.upload },
  'cloud-upload': { char: glyph.upload },
  eye: { char: glyph.view },
  shuffle: { char: glyph.shuffle },
  power: { char: glyph.power },
  store: { char: glyph.store },
  ship: { char: glyph.ship },
  'ship-wheel': { char: glyph.ship },
  anchor: { char: glyph.ship },
  house: { char: glyph.home },
  search: { char: glyph.search },
  info: { char: glyph.info },
  'circle-help': { char: glyph.help },
  inbox: { char: glyph.inbox },
  wifi: { char: glyph.wifi },
  'link-2': { char: glyph.link },
  'link-2-off': { char: glyph.link },
  'lock-keyhole': { char: glyph.lock },
  'key-round': { char: glyph.lock },
  'loader-circle': { char: glyph.loading, className: 'is-loading' },
  plus: { char: glyph.plus },
}

const group = (name: string, terms: string[]) => terms.some((term) => name.includes(term))

export function resolveIconfontGlyph(name: string): IconfontGlyph | undefined {
  if (exact[name]) return exact[name]
  if (group(name, ['check', 'badge-check'])) return { char: glyph.success }
  if (group(name, ['alert', 'warning', 'circle-x', 'wifi-off'])) return { char: glyph.warning }
  if (group(name, ['settings', 'filter', 'ellipsis', 'grip', 'keyboard'])) return { char: glyph.settings }
  if (group(name, ['calendar', 'clock', 'history', 'timer'])) return { char: glyph.calendar }
  if (group(name, ['refresh', 'rotate'])) return { char: glyph.refresh }
  if (group(name, ['folder'])) return { char: glyph.folder }
  if (group(name, ['search'])) return { char: glyph.pictureSearch }
  if (group(name, ['cpu', 'circuit', 'panels', 'scan', 'radio', 'network', 'unplug'])) return { char: glyph.device }
  if (group(name, ['battery'])) return { char: glyph.power }
  if (group(name, ['building', 'briefcase', 'landmark'])) return { char: glyph.store }
  if (group(name, ['user'])) return { char: glyph.user }
  if (group(name, ['staff'])) return { char: glyph.staff }
  if (group(name, ['message', 'mail', 'headphone', 'megaphone'])) return { char: glyph.message }
  if (group(name, ['edit', 'pencil', 'notebook', 'save'])) return { char: glyph.edit }
  if (group(name, ['package', 'boxes', 'warehouse', 'shopping-cart'])) return { char: glyph.package }
  if (group(name, ['route', 'list-restart'])) return { char: glyph.route }
  if (group(name, ['wrench', 'repair'])) return { char: glyph.repair }
  if (group(name, ['location', 'map-pin', 'locate', 'crosshair'])) return { char: glyph.location }
  if (group(name, ['bell'])) return { char: glyph.bell }
  if (group(name, ['map', 'layers'])) return { char: glyph.map }
  if (group(name, ['camera', 'image', 'video'])) return { char: glyph.camera }
  if (group(name, ['chart'])) return { char: glyph.chart }
  if (group(name, ['truck'])) return { char: glyph.truck }
  if (group(name, ['phone', 'smartphone'])) return { char: glyph.phone }
  if (group(name, ['fan', 'snowflake', 'thermometer', 'droplets', 'flashlight'])) return { char: glyph.fan }
  if (group(name, ['payment', 'wallet', 'credit-card', 'dollar'])) return { char: glyph.payment }
  if (group(name, ['share', 'send', 'paperclip', 'copy'])) return { char: glyph.share }
  if (group(name, ['globe', 'languages'])) return { char: glyph.map }
  if (group(name, ['cloud'])) return { char: glyph.upload }
  if (group(name, ['square'])) return { char: glyph.inbox }
  if (group(name, ['log-in'])) return { char: glyph.right }
  if (group(name, ['log-out'])) return { char: glyph.power }
  if (group(name, ['unlink'])) return { char: glyph.link }
  return undefined
}
