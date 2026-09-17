# GuideRail 商店发布物料指南

本目录（`store-assets/`）存放 Chrome Web Store 上架所需的文件与指南。

---

## 目录文件说明

- `PRIVACY_POLICY_GIST.md`: 纯文本 Markdown 格式隐私政策，用于 1 分钟创建公开的 GitHub Gist。
- `privacy-policy.html`: 独立的静态 HTML 隐私政策单页，排版优雅，支持离线或直接部署。
- `README.md`: 本操作指南。

---

## 第一步：生成公开的“隐私政策网址 (Privacy Policy URL)”

Google 审核必须要求一个公开的隐私政策链接。请按以下简易步骤操作（耗时约 1 分钟）：

1. 打开 [https://gist.github.com](https://gist.github.com) 并登录你的 GitHub 账号；
2. 打开本地文件 `store-assets/PRIVACY_POLICY_GIST.md`，复制里面的全部内容；
3. 在 Gist 页面中：
   - 文件名填写：`privacy-policy.md`
   - 内容框中：粘贴刚刚复制的文本
4. 点击右下角绿色按钮右侧的下拉箭头，选择 **"Create public gist"**（注意必须是 Public，不要选 Secret）；
5. 复制浏览器地址栏的完整 URL（格式形如 `https://gist.github.com/<你的用户名>/<一串字符>`）；
6. **这个网址就是你的 Privacy Policy URL！** 请妥善保存，提审时直接填入后台。

---

## 第二步：准备 1~2 张商店截图 (Screenshots)

Chrome Web Store 要求至少上传 1 张截图，要求尺寸为 **1280×800** 或 **640×400** 像素。

### 截图建议：
- **截图 1 (核心操作场景)**：
  - 打开 `https://chatgpt.com` 任意对话；
  - 截取包含助手回复以及回复下方 GuideRail 注入的 **"☆ 收藏"** 或 **"✓ 已收藏"** 按钮；
  - 同时展示右侧开启的 GuideRail 侧边栏（包含刚收藏好的笔记）。
- **截图 2 (阅读与管理场景，可选)**：
  - 侧边栏处于笔记阅读模式，展示 Markdown 渲染效果（代码块、列表、或者更换不同主题如 Parchment / Red Graphite）。

> [!TIP]
> 截图请直接截取浏览器内容区域，不要带有手机或外部显示器外壳模型（Mockup）。保持 1280×800 比例。

---

## 第三步：登录开发者后台提交审核

1. 打开 [Chrome Web Store 开发者控制台 (Chrome Developer Dashboard)](https://chrome.google.com/webstore/devconsole)；
2. 点击右上角 **"添加新项 (Add new item)"**；
3. 将位于项目目录中的发布包直接拖拽上传：
   ```text
   /Volumes/外部硬盘/Code/sandbox/GuideRail/release/cws/GuideRail-v0.7.1-cws.zip
   ```
4. 对照根目录下的 [`CHROMEWEBSTORE.md`](../CHROMEWEBSTORE.md) 文件，依次将准备好的：
   - 标题与描述
   - 权限理由（Justification）
   - 隐私数据勾选项与隐私政策 URL
   - 审核员测试说明（Reviewer Notes）
   逐项复制粘贴进去；
5. 上传准备好的 1~2 张截图与 128×128 图标；
6. 点击右上角 **"提交审核 (Submit for Review)"**！
