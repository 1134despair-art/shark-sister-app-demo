# 原型广场部署说明

本项目是 UniApp Vue 3 H5 纯前端原型，演示数据保存在前端代码和浏览器 LocalStorage 中，不需要部署 Node 服务、数据库或其他后端。

## 自动构建部署

推荐把源码包内容提交到 Demo 仓库的 `master` 分支。仓库根目录应直接包含 `package.json`、`package-lock.json`、`index.html`、`src/` 和 `scripts/`。

Jenkins 执行：

```bash
npm install
npm run build:prod
```

构建产物位于：

```text
dist/build/h5/
```

`build:prod` 会依次完成中文 H5 生产构建、相对资源路径转换和部署产物检查。检查不通过时命令会返回失败，避免发布白屏或缺少资源的版本。

建议使用 Node.js 20.17 或更高版本，并使用与 Node.js 兼容的 npm 版本。

## 直接部署静态包

如不经过 Jenkins，可把静态部署包解压到目标预览目录。解压后的目录根层必须直接包含：

```text
index.html
assets/
static/
```

页面使用 Hash 路由，支持部署到类似下面的多级目录：

```text
/prototype-preview/{projectCode}/{demoCode}/#/pages/shell/index
```

Web 服务只需按普通静态文件发布，不需要 History 路由回退或后端接口。
