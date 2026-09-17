# GuideRail Companion 协议 v1

状态：Phase 2 契约已冻结；扩展客户端和 Obsidian Companion 服务端尚未实现。

## 传输与信任边界

- Companion 默认只监听 `127.0.0.1:27124`，不得监听 `0.0.0.0`、局域网或公网地址。
- 基础地址为 `http://127.0.0.1:27124`。扩展不得自动扫描其他主机；自定义端口由用户明确配置。
- 除配对接口外，请求使用 `Authorization: Bearer <token>`。令牌至少包含 32 字节随机熵，只在配对成功响应中返回一次。
- 请求带 `X-GuideRail-Protocol: 1`。不支持的版本返回 `PROTOCOL_UNSUPPORTED`，不得猜测兼容。
- 服务端验证允许的扩展 Origin、令牌、请求体大小、字段、路径和 MIME。Origin 不是认证手段，令牌验证不可省略。
- 服务端只提供 GuideRail 领域操作，不提供任意路径读写、命令执行或 Vault 文件枚举接口。

所有 JSON 响应使用统一信封：

```json
{ "ok": true, "data": {} }
```

```json
{
  "ok": false,
  "error": {
    "code": "CONFLICT",
    "message": "目标笔记已存在且内容不同",
    "retryable": false
  }
}
```

客户端不得直接向用户展示服务端技术堆栈。服务端不得在日志中记录令牌、正文或图片数据。

## 配对

Obsidian 插件设置页由用户主动开启一个短时配对窗口，并显示 8 位配对码。配对码使用去除易混淆字符的 `A-Z2-9`，短时有效、单次使用，并有失败次数和速率限制。

`POST /v1/pair` 是唯一不需要 Bearer 令牌的写接口：

```json
{
  "code": "ABCD2345",
  "client": {
    "id": "扩展安装实例 UUID",
    "name": "GuideRail",
    "version": "0.8.0"
  }
}
```

成功后返回令牌、协议版本、Companion 版本、Vault 名称和实例 ID。插件未主动开启配对时返回 `PAIRING_DISABLED`。错误配对码返回 `PAIRING_CODE_INVALID`。

## 端点

| 方法 | 路径 | 用途 | 幂等要求 |
|---|---|---|---|
| `GET` | `/v1/status` | 协议、版本、Vault 和能力检查 | 天然幂等 |
| `POST` | `/v1/pair` | 短时配对并签发令牌 | 配对码单次使用 |
| `GET` | `/v1/library` | 获取 GuideRail 索引 | 天然幂等 |
| `POST` | `/v1/captures` | 保存正文与 Base64 图片 | 必须带 `Idempotency-Key` |
| `POST` | `/v1/imports` | 原样导入已有 Entry、Markdown 与附件 | 必须带 `Idempotency-Key` |
| `GET` | `/v1/entries/:id` | 读取 Markdown 与附件 | 天然幂等 |
| `PATCH` | `/v1/entries/:id` | 修改标题 | 相同请求幂等 |
| `POST` | `/v1/entries/:id/move` | 移动笔记和附件 | 相同请求幂等 |
| `POST` | `/v1/entries/:id/hide` | 从索引隐藏并返回撤销令牌 | 相同幂等键返回同一结果 |
| `POST` | `/v1/entries/:id/restore` | 使用撤销令牌恢复 | 相同请求幂等 |
| `POST` | `/v1/notebooks` | 新建逻辑文件夹 | 已存在视为成功 |
| `POST` | `/v1/library/rebuild` | 从所属 Markdown 重建索引 | 串行执行 |

收藏的幂等键固定为 `capture:<conversationId>:<messageId>`。服务端必须缓存或持久识别已经提交的操作；网络超时后的重试不得创建重复文件或覆盖外部编辑。

正文与图片的首版传输为 JSON + Base64，以复用扩展已有 `Capture`。单请求上限 26 MiB，每条最多 12 张图片，编码后图片总长度上限 25 MiB。以后可增加 multipart capability，但不能在 v1 中静默改变编码。

## 状态与内容格式

`GET /v1/status` 返回：

```json
{
  "protocol": 1,
  "companionVersion": "0.1.0",
  "vaultName": "My Vault",
  "instanceId": "随机实例 UUID",
  "paired": true,
  "capabilities": ["library-v1", "capture-json-base64"]
}
```

索引、Entry、Markdown frontmatter、附件命名和 `.guiderail/index.json` 继续使用现有格式。读取单条收藏时，图片按 Entry 中的顺序返回 `{ name, data }`，其中 `data` 是经过 MIME 和魔数验证的图片 Data URL。

## 错误及 HTTP 状态

| 错误码 | 建议 HTTP 状态 | 含义 |
|---|---:|---|
| `BAD_REQUEST` | 400 | JSON 或字段无效 |
| `AUTH_REQUIRED` | 401 | 缺少令牌 |
| `AUTH_INVALID` | 403 | 令牌无效或已撤销 |
| `PAIRING_DISABLED` | 403 | 用户未开启配对窗口 |
| `PAIRING_CODE_INVALID` | 403 | 配对码错误、过期或已使用 |
| `PROTOCOL_UNSUPPORTED` | 426 | 协议版本不兼容 |
| `PAYLOAD_TOO_LARGE` | 413 | 请求或附件超限 |
| `NOT_FOUND` | 404 | 收藏或资源不存在 |
| `CONFLICT` | 409 | 文件冲突、外部修改或幂等键冲突 |
| `VAULT_UNAVAILABLE` | 503 | Vault 未就绪或 Obsidian 正在退出 |
| `WRITE_FAILED` | 507 | 写入或磁盘空间失败 |
| `INTERNAL_ERROR` | 500 | 未分类内部错误 |

只有明确标记 `retryable: true` 的错误才允许自动退避重试。认证、冲突、请求格式和版本错误必须等待用户操作或客户端升级。
