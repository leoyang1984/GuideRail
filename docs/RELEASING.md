# 发布说明

## 从源码构建

Node.js 22.12+、npm，以及 macOS/Linux 的 `zip` 命令：

```sh
npm ci
npm run release:local
```

打包命令执行源码隐私扫描、测试和生产构建，再生成带版本与时间标识的三个 ZIP 文件：

发布构建会先清空明确的 `dist` 目录，避免开发期间保留的旧哈希资源进入安装包；普通 `npm run build` 仍保留原子替换所需的上一版文件。

- `release/GuideRail-<版本>-source-<时间>.zip`：源码、文档、锁文件及许可证，不含 `.git`、依赖、构建缓存或个人笔记。
- `release/GuideRail-<版本>-chrome-<时间>.zip`：可解压加载的扩展，根目录有 `manifest.json`，包含 MIT 许可证和运行时依赖声明。
- `release/GuideRail-<版本>-obsidian-companion-<时间>.zip`：Obsidian 桌面插件，包含 `main.js`、`manifest.json` 和安装说明，可解压到 Vault 的 `.obsidian/plugins/guiderail-companion/`。

源文件采用 `scripts/public-files.mjs` 中的明确目录清单。新增根目录发布文件时须同步清单。`.local/`、`release/`、个人备份、环境文件和密钥文件不应进入版本控制。目录设置及用户收藏不随扩展打包。

## 发布前检查

1. `npm audit` 检查当前已知依赖漏洞；结果受执行日期和注册表可用性影响。
2. `npm run check:privacy` 扫描当前发布源文件；扫描仅输出类别与位置，不输出敏感值。
3. 如需公开既有仓库，额外执行 `npm run check:history`，检查全部引用可达的提交元数据和文件内容。源码扫描通过不意味着旧 Git 历史安全。
4. 核对 ZIP 内容及许可证，在 Chrome 加载扩展并按 `docs/COMPANION_ACCEPTANCE.md` 验收配对、重启、收藏、阅读、整理、迁移和后端切换。

规则扫描不能保证发现全部隐私内容；真实对话、备份和截图仍需要人工判断。

本项目的首次公开发布采用干净源码建立新仓库，旧开发仓库保留为私有。不要将旧仓库的历史、标签、分支或远程引用合并到公开仓库。后续公开仓库应使用其自身的提交历史。

## 发布范围

本流程准备的是 GitHub 源码及可手动加载的 Chrome 扩展包。它不自动创建 GitHub Release，也不等同于 Chrome Web Store 上架。商店发布仍需要图标、截图、商店文案、隐私声明页面及实际浏览器验收。
