import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / ".tmp" / "v32-requirements.json"
TARGET = ROOT / "src" / "config" / "requirements.ts"


def route_for(row: int) -> str:
    if 8 <= row <= 16:
        return "/pages/auth/register" + ("?region=GLOBAL" if row <= 13 else "")
    if row == 17:
        return "/pages/auth/password?mode=first"
    if 18 <= row <= 24:
        return "/pages/auth/login"
    if 25 <= row <= 28:
        return "/pages/auth/password?mode=forgot"
    if 29 <= row <= 33:
        return "/pages/profile/detail?mode=" + ("edit" if row >= 32 else "view")
    if row == 34:
        return "/pages/auth/password?mode=reset"
    if row == 35:
        return "/pages/profile/settings"
    if 36 <= row <= 41:
        return "/pages/shell/index?tab=home"
    if 42 <= row <= 43:
        return "/pages/profile/settings?section=" + ("notifications" if row == 42 else "language")
    if 44 <= row <= 47:
        return "/pages/manage/form?entity=tickets&category=message"
    if 48 <= row <= 52:
        return "/pages/device/add?step=2"
    if 53 <= row <= 54 or 61 <= row <= 65:
        return "/pages/device/add?step=4"
    if 55 <= row <= 57:
        return "/pages/shell/index?tab=map"
    if 58 <= row <= 60:
        return "/pages/process/index?scenario=route"
    if 66 <= row <= 72:
        return "/pages/device/detail?id=dev-01"
    if 73 <= row <= 78:
        return "/pages/process/index?scenario=" + ("settings" if row == 78 else "control")
    if 79 <= row <= 86:
        return "/pages/manage/list?entity=waypoints" if row >= 83 else "/pages/shell/index?tab=map"
    if row == 87:
        return "/pages/process/index?scenario=playback"
    if 88 <= row <= 92:
        return "/pages/manage/form?entity=tickets&category=repair"
    if 93 <= row <= 97:
        return "/pages/process/index?scenario=ota"
    if 98 <= row <= 101:
        return "/pages/shell/index?tab=workbench"
    if 102 <= row <= 112:
        return "/pages/manage/form?entity=projects"
    if 113 <= row <= 114:
        return "/pages/manage/list?entity=projects&state=search"
    if 115 <= row <= 119:
        return "/pages/manage/" + ("form?entity=materials" if row <= 117 else "list?entity=materials")
    if 120 <= row <= 122:
        return "/pages/process/index?scenario=logistics"
    if 123 <= row <= 124:
        return "/pages/manage/list?entity=materials&state=price-search"
    if 125 <= row <= 126:
        return "/pages/process/index?scenario=dealerAnalytics"
    if 127 <= row <= 129:
        return "/pages/manage/list?entity=shipments"
    if row == 130:
        return "/pages/process/index?scenario=logistics"
    if row == 131:
        return "/pages/manage/list?entity=devices&state=unassigned"
    if row == 132:
        return "/pages/manage/form?entity=transfers&mode=assignment"
    if 133 <= row <= 134:
        return "/pages/manage/list?entity=transfers"
    if row == 135:
        return "/pages/manage/form?entity=transfers&mode=reallocation"
    if 136 <= row <= 137:
        return "/pages/manage/list?entity=transfers"
    if 138 <= row <= 142:
        return "/pages/process/index?scenario=payment"
    if row == 143:
        return "/pages/manage/list?entity=payments"
    if row == 144:
        return "/pages/manage/form?entity=tickets&category=complaint"
    if row == 145:
        return "/pages/manage/form?entity=tickets&category=transfer"
    return "/pages/manage/list?entity=tickets&state=transfer-selector&id=ticket-04"


def roles_for(row: int) -> list[str]:
    if 8 <= row <= 16 or 18 <= row <= 28:
        return ["guest"]
    if row == 17 or 98 <= row <= 137:
        return ["dealerAdmin", "dealerStaff"]
    if 29 <= row <= 97:
        return ["user", "dealerAdmin", "dealerStaff"]
    return ["user", "dealerAdmin", "dealerStaff"]


SIMULATED = {
    9, 11, 13, 15, 16, 19, 21, 22, 23, 26, 40, 42, 48, 49, 53, 54, 55, 56,
    57, 66, 67, 73, 74, 75, 76, 77, 78, 81, 82, 87, 92, 93, 94, 95, 96, 97,
    122, 129, 130, 138, 139, 140, 141, 142,
}
EMPTY = {59, 60, 100, 110, 111, 112}
DEMO_EXCEPTION = {136}
# Strict audit: these rows have a screen or part of the flow, but the current
# behavior does not yet satisfy the original V3.2 semantics end to end.
PARTIAL = {
    16, 53, 54, 55, 56, 57, 65, 73, 78, 79, 81, 87, 93, 94, 119,
    132, 133, 134, 135, 144, 145,
}


def evidence_for(row: int) -> list[str]:
    if row <= 35:
        service = "src/services/profile.ts" if 29 <= row <= 33 else "src/services/auth.ts"
    elif row <= 47:
        service = "src/pages/shell/index.vue" if row <= 41 else "src/pages/manage/form.vue"
    elif row <= 65:
        service = "src/services/device.ts"
    elif row <= 87:
        service = "src/services/routes.ts" if row >= 79 else "src/services/device.ts"
    elif row <= 92:
        service = "src/services/workflow.ts"
    elif row <= 97:
        service = "src/services/firmware.ts"
    elif row <= 114:
        service = "src/services/project.ts" if row >= 102 else "src/services/authorization.ts"
    elif row <= 137:
        service = "src/services/workflow.ts"
    elif row <= 142:
        service = "src/services/adapters.ts"
    else:
        service = "src/services/workflow.ts"
    return [f"docx:table-row-{row:03d}", service, f"tests/v32-requirements.test.ts#row-{row:03d}"]


def ts(value) -> str:
    return json.dumps(value, ensure_ascii=False)


def main() -> None:
    rows = {int(item["row"]): item["cells"] for item in json.loads(SOURCE.read_text(encoding="utf-8"))}
    entries = []
    for row in range(8, 147):
        cells = rows[row] + [""] * (8 - len(rows[row]))
        module, secondary, tertiary, field, field_type, description, special, logic = cells[:8]
        requirement = " / ".join(part for part in [module, secondary, tertiary, field, description] if part)
        if row in EMPTY:
            requirement = "原始需求表为空行，无可实施字段或操作"
        status = (
            "missing" if row in EMPTY
            else "demo-exception" if row in DEMO_EXCEPTION
            else "partial" if row in PARTIAL
            else "simulated-local" if row in SIMULATED
            else "complete-local"
        )
        fields = [f"{field}（{field_type}）" if field_type else field] if field else []
        actions = [description] if description else []
        states = [value for value in [special, logic] if value]
        entries.append(
            "  { "
            + f"sourceRow: {row}, requirement: {ts(requirement)}, roles: {ts(roles_for(row))}, route: {ts(route_for(row))}, "
            + f"fields: {ts(fields)}, actions: {ts(actions)}, states: {ts(states)}, evidence: {ts(evidence_for(row))}, status: {ts(status)}"
            + " },"
        )

    header = '''import type { Role } from '@/types/models'\n\nexport type RequirementStatus = 'complete-local' | 'blocked-external' | 'demo-exception' | 'missing'\n\nexport interface RequirementCase {\n  sourceRow: number\n  requirement: string\n  roles: Role[]\n  route: string\n  fields: string[]\n  actions: string[]\n  states: string[]\n  evidence: string[]\n  status: RequirementStatus\n}\n\n// Materialized from the V3.2 DOCX table. Do not replace this with range-based completion flags.\nexport const v32RequirementCoverage: RequirementCase[] = [\n'''
    footer = ''']\n\nexport const v32PlatformRequirements: RequirementCase[] = [\n  { sourceRow: 4, requirement: '国内版/海外版启动标识决定地图、认证与服务区域', roles: ['guest', 'user', 'dealerAdmin', 'dealerStaff'], route: '/pages/auth/login?state=region', fields: ['版本标识（系统逻辑）'], actions: ['读取 VITE_APP_REGION 并选择区域能力'], states: ['CN', 'GLOBAL'], evidence: ['docx:table-row-004', 'src/config/region.ts', 'tests/v32-requirements.test.ts#row-004'], status: 'complete-local' },\n  { sourceRow: 5, requirement: '国内版支持手机号与微信认证，数据存储在国内服务器', roles: ['guest'], route: '/pages/auth/login?region=CN', fields: ['国内版特性（说明）'], actions: ['手机号认证', '微信认证'], states: ['本地手机号认证可用', '微信 SDK 未配置', '国内服务器未接入'], evidence: ['docx:table-row-005', 'src/services/auth.ts', 'src/services/adapters.ts', 'tests/v32-requirements.test.ts#row-005'], status: 'blocked-external' },\n  { sourceRow: 6, requirement: '海外版支持邮箱与 Google 认证，数据存储于美国并使用其他地区 CDN', roles: ['guest'], route: '/pages/auth/login?region=GLOBAL', fields: ['海外版特性（说明）'], actions: ['邮箱认证', 'Google 认证'], states: ['本地邮箱认证可用', 'Google SDK 未配置', '海外服务器与 CDN 未接入'], evidence: ['docx:table-row-006', 'src/services/auth.ts', 'src/services/adapters.ts', 'tests/v32-requirements.test.ts#row-006'], status: 'blocked-external' },\n]\n\nexport const v32RequirementSource = '鲨鱼妹妹项目需求-APP端功能列表_V3.2.docx#table-row-008-146'\n'''
    header = header.replace(
        "'complete-local' | 'blocked-external' | 'demo-exception' | 'missing'",
        "'complete-local' | 'simulated-local' | 'partial' | 'integration-required' | 'demo-exception' | 'missing'",
    )
    footer = footer.replace("'blocked-external'", "'integration-required'")
    footer = footer.replace("'微信 SDK 未配置', '国内服务器未接入'", "'微信流程可本地模拟', '国内服务器需生产环境接入'")
    footer = footer.replace("'Google SDK 未配置', '海外服务器与 CDN 未接入'", "'Google 流程可本地模拟', '海外服务器与 CDN 需生产环境接入'")
    TARGET.write_text(header + "\n".join(entries) + "\n" + footer, encoding="utf-8")
    print(f"generated {len(entries)} materialized requirement contracts in {TARGET}")


if __name__ == "__main__":
    main()
