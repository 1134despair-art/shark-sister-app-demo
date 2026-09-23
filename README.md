# 鲨鱼妹妹 UniApp 前端

基于 V3.2 功能清单、`ui-design` 高保真设计和 `assest` 图片素材实现的 Vue 3 + TypeScript + Vite UniApp 静态前端。无后端依赖，业务数据通过 `uni.setStorageSync` 持久化。

## 启动

```bash
pnpm install
pnpm sync:assets
pnpm dev:h5:cn
```

国际版使用 `pnpm dev:h5:global`。生产构建：

```bash
pnpm build:h5:cn
pnpm build:h5:global
pnpm build:app:cn
pnpm build:app:global
```

构建结果分别归档到 `dist/releases/h5-cn`、`h5-global`、`app-cn` 和 `app-global`。App 目录是 HBuilderX 可导入的前端资源，不是签名 APK/IPA。

## 演示账号

| 身份 | 账号 | 密码 |
|---|---|---|
| 普通用户 | `13800002861` | `123456` |
| 经销商管理员 | `13800000028` | `123456` |
| 经销商员工 | `13800000268` | `123456` |
| 国际版用户 | `captain@seawind.com` | `123456` |
| 首次改密 | `DLR-SH-0028` | `123456` |

## 功能结构

- 统一认证：国内/海外登录、注册、验证码、找回密码、游客限制、首次改密和角色识别。
- 首次启动页：默认使用蓝白启动素材；配置 `VITE_LAUNCH_CONFIG_URL` 后可由后台下发标题、图片、展示时长、跳过开关和配置版本。
- 普通用户：首页、设备、添加、地图、我的；支持设备绑定/解绑、控制、报表、航点和售后。
- 经销商：首页、设备、工作台、地图、我的；支持项目、员工、工单、物料、物流、调拨、采购和支付。
- 本地 CRUD：Repository 提供 list/get/create/update/remove，审批、支付、物流和审计数据采用状态流转或只读规则。
- 外部能力：蓝牙、设备控制、OTA、支付、推送、云同步和第三方登录未配置时明确不可用且不改变业务数据；扫码与系统导航调用 UniApp 平台 API。
- 国际化：中国版/国际版环境构建，运行时支持简体中文/英文和公制/英制切换。
- 设计验收：`src/config/designCases.ts` 注册真实的 115 个设计 ID，其中 105 个 required、5 个 derived、5 个 extended；已删除 12 个配色实验稿。
- 需求追踪：`src/config/requirementsSource.ts` 由 Excel `APP端功能列表` 第 004–146 行自动生成；141 条非空需求逐项记录 UI、操作或集成结论，仅第 059、060 行为空白。
- 数据安全：数据库 schemaVersion 5 无损迁移旧数据，Repository 强制身份范围，路由、查询和业务操作执行分层权限检查。

## 验证

```bash
pnpm type-check
pnpm test
pnpm test:e2e
```

归档构建可通过 `pnpm preview:h5:cn` 和 `pnpm preview:h5:global` 预览。另开终端后可运行：

```bash
pnpm test:responsive
pnpm test:visual
pnpm test:global
```

这些脚本会检查 375/390/430px 移动端、431–1920px 桌面 390×844 固定画布、隐藏滚动条、底部按钮遮挡、缺图、控制台错误，以及 Global 主流程的英文可见文案。

115 个设计案例默认验证 CN 构建，并使用 `ui-design/exports/screens` 中同 ID 的 390×844 基线执行 98% 像素相似度门槛。验证 Global 构建时，先启动 `pnpm preview:h5:global`，再在 PowerShell 中运行：

固定验收路由 `/pages/design-case/index?id={ID}` 会加载对应设计的同源 HTML/CSS/PNG 模板；普通 App 路由不加载该层。业务 E2E 在设计路由附加 `parity=0`，直接操作真实 Vue 页面与本地业务数据，防止视觉模板遮蔽功能缺口。

最终验收产物：

- `artifacts/visual-parity/parity-summary.html`：115 页设计图、App 图和差异图对照。
- `artifacts/visual-parity/parity-summary.json`：逐页 `diffPixels`、`diffRatio`、`similarity` 和 scope。
- `artifacts/visual-parity/html/index.html`：115 页 Playwright 视觉执行报告。
- `artifacts/e2e/html/index.html`：游客、权限、表单、设备、售后和经销商功能报告。

重新生成视觉报告：

```powershell
$env:PLAYWRIGHT_REPORT_NAME='visual-parity'
pnpm exec playwright test tests/e2e/design-cases.spec.ts --workers=1
node scripts/visual-parity-report.mjs
```

当前基线验收结果为 115/115 通过，最低单页相似度 99.5583%。

```powershell
$env:E2E_BASE_URL='http://127.0.0.1:18763'
$env:E2E_SERVER_COMMAND='node scripts/serve-static.mjs dist/releases/h5-global 18763'
$env:GLOBAL_AUDIT='1'
pnpm exec playwright test tests/e2e/design-cases.spec.ts
```

Global 模式除页面可访问和无横向溢出外，还会逐案例检查可见区域不存在未翻译中文。
