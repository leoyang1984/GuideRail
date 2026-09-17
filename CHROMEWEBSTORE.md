# Chrome Web Store Listing — GuideRail

> Last Updated: 2026-09-17

---

## 1. 商店基础信息 (Store Listing Metadata)

### 扩展名称 (Extension Name)
```text
GuideRail
```

### 短描述 (Short Description - 108/132 字符)
```text
Save ChatGPT replies and images directly into your local Obsidian vault or disk folder with Markdown support.
```
*(中文版供参考: 收藏 ChatGPT 回复和图片，自动保存到本地笔记库，支持 Markdown 与 Obsidian。)*

### 详细描述 (Detailed Description)
*(直接复制下方纯文本内容至开发者后台，已适配 CWS 格式并包含商标免责声明)*

```text
GuideRail is a local-first Chrome extension that lets you effortlessly clip ChatGPT responses and generated images directly into your local Obsidian vault or any folder on your computer as clean Markdown notes.

Enjoy distraction-free reading right in the Chrome side panel, or jump directly back to the original message in your conversation anytime.

KEY FEATURES
• One-Click Clipping: Add a simple "Bookmark" button under ChatGPT assistant replies to capture responses with formatting intact.
• Automatic Image Archiving: Download and bundle AI-generated diagrams and images into local attachments for complete offline access.
• Dual Storage Modes: Pair seamlessly with the desktop Obsidian Companion plugin, or save directly to any disk folder using the browser's native directory picker.
• Immersive Side Panel Reader: Read, browse, and manage your clipped notes without leaving your active browser window.
• Jump to Source: Click "Jump to Source" on any note to immediately locate and scroll to the original message on ChatGPT.
• 5 Reading Themes: Switch between System, Red Graphite Light, Red Graphite Dark, Nordic Snow, and Parchment themes.
• 100% Local & Private: No accounts, no cloud servers, and zero analytics. Your notes never leave your machine.

HOW TO USE
1. Click the GuideRail icon in your Chrome toolbar to open the side panel.
2. Choose your preferred storage:
   - Click "Select Local Folder" to choose any folder on your computer; OR
   - Pair with the Obsidian Companion desktop plugin using an 8-character pairing code.
3. Browse ChatGPT (chatgpt.com) and click the "☆ Bookmark" button beneath any assistant response.
4. Your note and its images are instantly saved to your local notebook and viewable in the side panel!

PRIVACY & DATA SAFETY
GuideRail respects your privacy completely. The extension operates entirely locally:
• No cloud storage or remote servers
• No third-party tracking or telemetry
• No accounts or login required
• Web page content is only captured when you explicitly click the Bookmark button.

DISCLAIMER
ChatGPT is a trademark of OpenAI, Inc. Obsidian is a trademark of Dynalist Inc. GuideRail is an independent, open-source tool and is not affiliated with, endorsed by, or sponsored by OpenAI, Inc. or Dynalist Inc.
```

### 类别 (Category)
```text
Productivity (效率)
```

### 单一功能说明 (Single Purpose Statement)
```text
Saves ChatGPT conversation replies and reference images as local Markdown notes into an Obsidian vault or disk folder for offline reading.
```

### 语言 (Languages)
```text
English (United States), 中文 (简体)
```

---

## 2. 权限申辩词 (Permissions Justification)

*在提交时，Chrome Web Store 会要求针对每项敏感权限填写具体的用途理由，请直接复制：*

| 权限 (Permission) | 类型 | 申辩理由 (Justification for CWS Reviewer) |
|---|---|---|
| `sidePanel` | permissions | Required to provide an integrated note reader and notebook manager within Chrome's side panel, allowing users to browse their saved notes alongside their active web pages. |
| `tabs` | permissions | Required to locate and activate the matching ChatGPT conversation tab when users click "Jump to Source", and to read the active tab URL to prevent accidental note overwriting across conversation switches in single-page applications. |
| `storage` | permissions | Required to save user preferences locally (such as selected reader themes, UI language preference, and the identifier of the active local notebook target). |
| `contextMenus` | permissions | Required to provide a right-click "Clip selection to GuideRail" menu option so users can bookmark highlighted excerpt text from ChatGPT responses. |
| `https://images.openai.com/*` | host_permissions | Required to download OpenAI-generated images and diagrams referenced in ChatGPT responses directly to the user's local attachments folder for offline viewing. |
| `https://*.oaiusercontent.com/*` | host_permissions | Required to download image assets hosted on OpenAI's user content delivery domains when saving conversation replies. |
| `http://127.0.0.1/*` | optional_host_permissions | Declared as optional host permission. Only requested on-demand when the user chooses to pair GuideRail with their local desktop Obsidian companion plugin via localhost loopback. |

---

## 3. 隐私与数据使用声明表单 (Data Usage Disclosure)

*在后台“隐私权规范 (Privacy practices)”标签页中勾选：*

- **单一功能声明 (Single purpose)**: 填写上文中的 Single Purpose Statement。
- **权限合理性 (Permission justification)**: 填写上表对应项。
- **数据收集 (Data Collection)**:
  - **是否收集用户数据？**: 勾选 **是 (Yes)**
  - **数据类型勾选**:
    - 勾选 **“网页内容 (Website content)”**（因读取 chatgpt.com 的消息内容）
      - **用途**: App functionality (应用功能)
      - **是否离开设备 (Off-device)**: 勾选 **“否 / 未离开设备 (Not transmitted off-device)”**（数据完全保存在本地磁盘）
  - **其他所有数据类别（个人身份信息、健康、财务、位置等）**: 全部勾选 **“否 (No)”**
- **三项开发者承诺 (Certifications)**:
  - [x] 我承诺不向第三方出售或转让用户数据。
  - [x] 我承诺不将用户数据用于与扩展核心功能无关的用途。
  - [x] 我承诺不将用户数据用于信用评估或贷款目的。

---

## 4. 给审核员的测试指南 (Reviewer Notes / Testing Instructions)

*审核员没有 Obsidian，请在提审的 “Notes for reviewer” 中粘贴以下内容：*

```text
Hello Review Team,

GuideRail allows users to save ChatGPT conversation replies to either:
1) A local disk folder (via Chrome's native File System Access API), OR
2) A local desktop Obsidian Vault (via optional local loopback pairing).

TO TEST THE EXTENSION WITHOUT OBSIDIAN:
1. Click the GuideRail extension icon in the toolbar to open the Side Panel.
2. In the initial setup screen, click the "Select Local Folder" (选择本地文件夹) button and choose any temporary folder on your test machine.
3. Grant permission when the browser asks to access files in that folder. The side panel will now show your ready notebook ("收件箱 / Inbox").
4. Navigate to https://chatgpt.com (or any conversation).
5. Beneath any assistant response, you will observe a "☆ Bookmark" (☆ 收藏) button injected by the extension.
6. Click "☆ Bookmark". The button changes to "✓ Bookmarked", and the message content is immediately written to your chosen local folder and displayed inside the Side Panel reader.
7. Click the "Jump to Source" button at the top of the note in the side panel to see it smoothly scroll back to the original response.

Note on loopback permission:
The optional permission `http://127.0.0.1/*` is only requested when pairing with the optional open-source Obsidian companion desktop plugin and is never invoked during the local folder workflow.

Thank you for your review!
```

---

## 5. 待准备的视觉物料清单 (Visual Assets Checklist)

| 物料类型 | 规格要求 | 状态 | 说明 |
|---|---|---|---|
| **商店图标 (Store Icon)** | 128×128 PNG | ✅ 已就绪 | `public/icons/icon-128.png` |
| **截图 1 (Screenshot 1)** | 1280×800 或 640×400 PNG/JPEG | ⬜ 待用户截取 | 展示在 ChatGPT 对话页面中，点击回复下方的“收藏”按钮 |
| **截图 2 (Screenshot 2)** | 1280×800 或 640×400 PNG/JPEG | ⬜ 待用户截取 | 展示侧边栏中的 Markdown 笔记阅读界面与主题切换 |
| **小型宣传图 (Small Promo Tile)** | 440×280 PNG/JPEG | ⬜ 推荐制作 | 商店展示卡片背景（可选但强烈建议） |
