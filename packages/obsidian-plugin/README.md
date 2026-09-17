# GuideRail Companion for Obsidian

桌面端 Obsidian 插件。它在 `127.0.0.1` 上提供经过配对认证的本地接口，让 GuideRail Chrome 扩展通过 Obsidian Vault API 保存 Markdown 和附件，不再依赖浏览器目录授权。

## 构建

在仓库根目录运行：

```sh
npm install
npm run build:companion
```

构建产物是本目录下的 `main.js`。开发安装时，将以下文件复制到 Vault：

```text
<Vault>/.obsidian/plugins/guiderail-companion/
  main.js
  manifest.json
```

然后在 Obsidian 的“第三方插件”中启用 GuideRail Companion。插件仅支持桌面端。

## 当前阶段

Phase 5 已实现扩展端配对、双后端切换和从普通文件夹到 Companion 的预览式迁移。开发构建可以完成收藏、阅读、整理和幂等迁移。正式发布前仍需在真实 Chrome 与 Obsidian 中执行端到端手动验收。

服务默认监听 `127.0.0.1:27124`，不会监听局域网地址。配对码有效期 5 分钟，连续失败 5 次后作废。持久化设置只保存令牌 SHA-256，不保存明文令牌。
