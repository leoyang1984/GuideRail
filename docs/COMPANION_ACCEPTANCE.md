# Obsidian Companion 手动验收

自动化测试已覆盖协议、认证、文件一致性与双后端调用。以下步骤需要在真实 Chrome 与桌面端 Obsidian 中执行。

1. 运行 `npm run build` 和 `npm run build:companion`。
2. 将 `packages/obsidian-plugin/main.js` 与 `manifest.json` 复制到测试 Vault 的 `.obsidian/plugins/guiderail-companion/`，重新加载并启用插件。
3. 在 Chrome 开发者模式加载 `dist`。打开 GuideRail，选择“连接 Obsidian”。
4. 在 Obsidian Companion 设置中生成配对码，将配对码填入 GuideRail。确认 Chrome 只请求访问 `127.0.0.1`，配对后显示正确 Vault 名称。
5. 收藏一条纯文字回复和一条图文回复。确认 `GuideRail/收件箱` 中生成 Markdown、附件和 `.guiderail/index.json`，Obsidian 可正常显示图片。
6. 刷新 ChatGPT、关闭并重开侧栏、重启 Chrome，再次收藏：不应重新请求文件夹授权或重新配对。
7. 重启 Obsidian：启动完成后列表和收藏恢复。关闭 Obsidian 时点击收藏，应显示“无法连接 Obsidian”，不得显示收藏成功。
8. 在 GuideRail 中测试改标题、移动、新建文件夹、移出和撤销；确认文件、附件和索引一致。
9. 在 Companion 设置中点击“检查迁移”，核对待导入、相同和冲突数量。执行迁移后检查标题、创建时间、文件夹、正文和附件；原文件夹内容必须保持不变。再次检查时，已迁移内容应显示为相同。
10. 在设置中切到普通文件夹模式，确认原目录库仍可访问；再切回 Companion，已有连接未被自动删除，主动“重新配对”除外。
11. 修改 Companion 端口并重新配对，确认默认端口不可用时仍能连接。

首次验收不要使用正式 Vault。确认迁移统计和文件内容符合预期后，再备份正式资料并迁移。
