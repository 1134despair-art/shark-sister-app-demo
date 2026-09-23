export interface RequirementCase {
  id: string
  module: 'auth' | 'home' | 'device' | 'map' | 'profile' | 'support' | 'dealer' | 'dialog'
  title: string
  route: string
  role: 'none' | 'user' | 'dealer'
  scope: 'required' | 'derived' | 'extended'
  session: 'anonymous' | 'user' | 'dealer'
  region: 'CN' | 'GLOBAL'
  fixtureKey: string
  requiredCapability: string | null
  expectedState: string
  screenAnchor: string
  testScenario: string
}

export type DesignCase = RequirementCase

function capabilityFor(route: string) {
  if (route.includes('entity=dealers')) return 'dealer.manage'
  if (route.includes('entity=employees')) return 'staff.manage'
  if (route.includes('entity=materials') || route.includes('entity=shipments')) return 'material.apply'
  if (route.includes('entity=transfers') || route.includes('state=unassigned')) return 'device.assign'
  if (route.includes('entity=projects')) return 'project.manage'
  if (route.includes('scenario=control') || route.includes('scenario=settings') || route.includes('scenario=ota')) return 'device.control'
  return null
}
function expectedStateFor(route: string) {
  const query = new URLSearchParams(route.split('?')[1] || '')
  return query.get('state') || query.get('scenario') || query.get('mode') || query.get('tab') || query.get('step') || 'default'
}
const make = (prefix: string, module: RequirementCase['module'], role: RequirementCase['role'], routes: string[], titles: string[]): RequirementCase[] =>
  titles.map((title, index) => {
    const id = `${prefix}${String(index + 1).padStart(2, '0')}`
    const route = routes[index]
    return {
      id, module, role, title, route, scope: 'required',
      session: role === 'dealer' ? 'dealer' : role === 'user' ? 'user' : 'anonymous',
      region: route.includes('GLOBAL') ? 'GLOBAL' : 'CN', fixtureKey: `v32-${id.toLowerCase()}`,
      requiredCapability: capabilityFor(route), expectedState: expectedStateFor(route),
      screenAnchor: `${route.split('?')[0]}#${id.toLowerCase()}`, testScenario: `design-case-${id.toLowerCase()}`,
    }
  })

const strictRequirementCases: RequirementCase[] = [
  ...make('A', 'auth', 'none', [
    '/pages/auth/login?state=region', '/pages/auth/login', '/pages/auth/login?region=GLOBAL', '/pages/auth/register', '/pages/auth/register?region=GLOBAL', '/pages/auth/verify', '/pages/auth/password?mode=forgot', '/pages/auth/password?mode=first', '/pages/auth/verify?purpose=wechat', '/pages/auth/login?state=role',
  ], ['启动与服务地区','国内账号登录','海外账号登录','手机号注册','邮箱注册','验证码确认','忘记密码','经销商首次改密','微信绑定手机号','经销商角色识别']),
  ...make('H', 'home', 'user', [
    '/pages/shell/index?tab=home', '/pages/shell/index?tab=home&state=empty',
  ], ['首页正常状态','首页首次空状态']),
  ...make('D', 'device', 'user', [
    '/pages/shell/index?tab=device&status=all','/pages/shell/index?tab=device&status=online','/pages/shell/index?tab=device&status=offline','/pages/shell/index?tab=device&state=filter','/pages/device/detail?id=dev-01','/pages/device/detail?id=dev-03','/pages/process/index?scenario=control','/pages/process/index?scenario=settings','/pages/process/index?scenario=location','/pages/device/add?step=0','/pages/device/add?step=2&method=bluetooth','/pages/device/add?step=2&method=qr','/pages/device/add?step=2&method=manual','/pages/device/add?step=3','/pages/device/add?step=4','/pages/device/add?step=5','/pages/process/index?scenario=info&deviceId=dev-01',
  ], ['设备列表·全部','设备列表·在线','设备列表·离线','设备搜索与筛选','设备详情·在线','设备详情·离线','远程控制面板','设备运行设置','设备位置','添加设备·权限预检','添加设备·蓝牙扫描','添加设备·扫码绑定','添加设备·手动输入','添加设备·建立连接','添加设备·地区校验','添加设备·绑定成功','设备完整信息']),
  ...make('M', 'map', 'user', [
    '/pages/device/detail?id=dev-01','/pages/manage/list?entity=waypoints&deviceId=dev-01','/pages/manage/form?entity=waypoints&deviceId=dev-01','/pages/manage/form?entity=waypoints&id=wp-01&deviceId=dev-01','/pages/manage/list?entity=waypoints&status=pending&deviceId=dev-01','/pages/process/index?scenario=route&deviceId=dev-01','/pages/process/index?scenario=route&state=sort&deviceId=dev-01','/pages/process/index?scenario=playback&deviceId=dev-01','/pages/process/index?scenario=ota&stage=0&deviceId=dev-01','/pages/process/index?scenario=ota&stage=1&deviceId=dev-01','/pages/process/index?scenario=ota&stage=2&deviceId=dev-01','/pages/process/index?scenario=ota&stage=3&deviceId=dev-01','/pages/process/index?scenario=ota&state=failed&deviceId=dev-01',
  ], ['海图与航点','航点列表','保存当前位置','航点详情','航点上传队列','海图航线规划','航线航点排序','航点导航回放','OTA 版本检测','OTA 下载固件','OTA 蓝牙传输','OTA 更新成功','OTA 更新失败']),
  ...make('P', 'profile', 'user', [
    '/pages/shell/index?tab=profile','/pages/profile/detail?mode=view','/pages/profile/detail?mode=edit','/pages/auth/password?mode=reset','/pages/profile/settings','/pages/profile/settings?section=notifications','/pages/profile/settings?section=language','/pages/manage/list?entity=payments',
  ], ['我的','个人资料','编辑个人资料','修改登录密码','App 设置','通知设置','语言设置','支付记录']),
  ...make('S', 'support', 'user', [
    '/pages/manage/list?entity=tickets&mode=hub','/pages/manage/form?entity=tickets&category=message','/pages/manage/form?entity=tickets&category=repair','/pages/manage/list?entity=tickets&state=success','/pages/manage/list?entity=tickets&state=timeline','/pages/manage/form?entity=tickets&category=complaint','/pages/manage/form?entity=tickets&category=transfer','/pages/manage/list?entity=tickets&type=transfer',
    '/pages/manage/list?entity=tickets&state=message-detail&id=ticket-04','/pages/manage/list?entity=tickets&state=transfer-selector&id=ticket-04','/pages/manage/list?entity=tickets&state=message-progress&id=ticket-04',
  ], ['售后与帮助中心','客服留言','故障报修','报修提交成功','报修处理进度','提交投诉','跨区售后转移','跨区转移进度','留言详情与升级','留言转单对象选择','留言转单进度']),
  ...make('B', 'dealer', 'dealer', [
    '/pages/shell/index?tab=workbench','/pages/manage/list?entity=projects&state=search','/pages/manage/list?entity=projects&state=result','/pages/manage/form?entity=projects&step=device','/pages/manage/form?entity=projects&step=customer','/pages/manage/form?entity=projects&id=pro-01&mode=detail','/pages/manage/form?entity=tickets&category=repair','/pages/manage/form?entity=materials','/pages/manage/list?entity=materials','/pages/manage/list?entity=shipments','/pages/process/index?scenario=logistics','/pages/process/index?scenario=dealerAnalytics','/pages/manage/list?entity=devices&state=unassigned','/pages/manage/form?entity=transfers&mode=assignment','/pages/manage/list?entity=transfers','/pages/process/index?scenario=payment','/pages/manage/list?entity=payments','/pages/manage/list?entity=employees','/pages/manage/form?entity=employees&id=emp-01&mode=permissions','/pages/shell/index?tab=home','/pages/shell/index?tab=device','/pages/shell/index?tab=map','/pages/shell/index?tab=profile','/pages/manage/list?entity=tickets','/pages/manage/list?entity=dealers','/pages/manage/form?entity=dealers&type=dealer','/pages/manage/form?entity=dealers&id=dealer-02&mode=detail','/pages/profile/settings?section=role-scope',
  ], ['经销商工作台','项目查询','项目查询结果','新建安装项目·设备','新建安装项目·客户','项目详情','新建售后项目','售后物料申请','物料审批进度','物流订单','物流轨迹','售后数据概览','未分配设备','设备分配确认','分配与调货记录','采购结算与支付','经销商支付记录','员工账号管理','员工权限设置','经销商版首页','经销商版设备','经销商版地图','经销商版我的','经销商售后工单','二级经销商管理','新建二级经销商','二级经销商详情','账号角色与数据范围']),
  ...make('X', 'dialog', 'none', Array.from({ length: 16 }, (_, index) => `/pages/design-case/index?id=X${String(index + 1).padStart(2, '0')}`),
    ['账号锁定弹窗','未登录操作拦截','地区不匹配弹窗','设备已绑定弹窗','设备未建项目弹窗','发现固件更新弹窗','删除航点弹窗','解绑设备弹窗','危险控制确认','退出登录弹窗','蓝牙权限 Sheet','定位权限 Sheet','设备指令超时弹窗','支付结果弹窗','通用状态组件板','经销商权限受限弹窗']),
]

function uiIdForRequiredCase(item: RequirementCase) {
  const number = Number(item.id.slice(1))
  if (item.module === 'home' && number === 2) return 'H03'
  if (item.module === 'device' && number >= 9) return `D${String(number + 5).padStart(2, '0')}`
  if (item.module === 'dealer' && number >= 16 && number <= 27) return `B${String(number + 1).padStart(2, '0')}`
  if (item.module === 'dealer' && number === 28) return 'B30'
  return item.id
}

function withUiId(item: RequirementCase): RequirementCase {
  const id = uiIdForRequiredCase(item)
  return { ...item, id, fixtureKey: `v32-${id.toLowerCase()}`, screenAnchor: `${item.route.split('?')[0]}#${id.toLowerCase()}`, testScenario: `design-case-${id.toLowerCase()}` }
}

const extraCases: RequirementCase[] = [
  { id:'H02',module:'home',role:'user',scope:'derived',session:'user',region:'CN',fixtureKey:'v32-h02',title:'首页·设备异常',route:'/pages/shell/index?tab=home&state=abnormal',requiredCapability:null,expectedState:'abnormal',screenAnchor:'/pages/shell/index#h02',testScenario:'design-case-h02' },
  { id:'H04',module:'home',role:'user',scope:'extended',session:'user',region:'CN',fixtureKey:'v32-h04',title:'消息中心',route:'/pages/manage/list?entity=messages&mode=user',requiredCapability:null,expectedState:'user',screenAnchor:'/pages/manage/list#h04',testScenario:'design-case-h04' },
  { id:'H05',module:'home',role:'user',scope:'extended',session:'user',region:'CN',fixtureKey:'v32-h05',title:'设备类型分布',route:'/pages/process/index?scenario=deviceDistribution',requiredCapability:null,expectedState:'deviceDistribution',screenAnchor:'/pages/process/index#h05',testScenario:'design-case-h05' },
  { id:'D09',module:'device',role:'user',scope:'extended',session:'user',region:'CN',fixtureKey:'v32-d09',title:'设备数据报表',route:'/pages/process/index?scenario=report&deviceId=dev-01',requiredCapability:null,expectedState:'report',screenAnchor:'/pages/process/index#d09',testScenario:'design-case-d09' },
  ...([['D10','运行时长','runtime'],['D11','产量','output'],['D12','功率','power'],['D13','温度','temperature']] as const).map(([id,title,trend]) => ({ id,module:'device' as const,role:'user' as const,scope:'derived' as const,session:'user' as const,region:'CN' as const,fixtureKey:`v32-${id.toLowerCase()}`,title:`趋势·${title}`,route:`/pages/device/detail?id=dev-01&trend=${trend}`,requiredCapability:null,expectedState:trend,screenAnchor:`/pages/device/detail#${id.toLowerCase()}`,testScenario:`design-case-${id.toLowerCase()}` })),
  { id:'B16',module:'dealer',role:'dealer',scope:'extended',session:'dealer',region:'CN',fixtureKey:'v32-b16',title:'设备与配件采购',route:'/pages/manage/list?entity=purchases&state=catalog',requiredCapability:'purchase.create',expectedState:'catalog',screenAnchor:'/pages/manage/list#b16',testScenario:'design-case-b16' },
  { id:'B29',module:'dealer',role:'dealer',scope:'extended',session:'dealer',region:'CN',fixtureKey:'v32-b29',title:'经销商消息中心',route:'/pages/manage/list?entity=messages&mode=dealer',requiredCapability:null,expectedState:'dealer',screenAnchor:'/pages/manage/list#b29',testScenario:'design-case-b29' },
]

const moduleOrder: RequirementCase['module'][] = ['auth','home','device','map','profile','support','dealer','dialog']
export const designCaseRegistry: RequirementCase[] = [...strictRequirementCases.map(withUiId), ...extraCases]
  .sort((left, right) => moduleOrder.indexOf(left.module) - moduleOrder.indexOf(right.module) || left.id.localeCompare(right.id))

export const requirementCases = designCaseRegistry.filter((item) => item.scope === 'required')

export function getDesignCase(id: string) {
  return designCaseRegistry.find((item) => item.id === id)
}
