import {
  COMPANION_DEFAULT_PORT, COMPANION_HEADERS, COMPANION_PROTOCOL_VERSION, captureIdempotencyKey, companionRoutes,
  parseCompanionResponse, parseEntry, parseEntryContent, parseLibraryIndex, parsePairResponse, parseStatusResponse,
  type CompanionResponse, type PairResponse, type StatusResponse,
} from './protocol';
import type { Capture } from '../storage/schema';
import type { Entry, LibraryIndex } from '../library/library';
import type { EntryContentResponse } from './protocol';

export interface CompanionConnection { origin: string; token: string; instanceId: string; vaultName: string; companionVersion: string }
export const COMPANION_CONNECTION_KEY = 'guiderail-companion-connection';
export const LIBRARY_BACKEND_KEY = 'guiderail-library-backend';

function companionOrigin(port: number) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('端口须为 1024–65535');
  return `http://127.0.0.1:${port}`;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Companion 返回了无效数据'); return value as Record<string, unknown>;
}
async function responseJson(response: Response) {
  const value = await response.text(); if (value.length > 30 * 1024 * 1024) throw new Error('Companion 响应过大');
  try { return JSON.parse(value) as unknown; } catch { throw new Error('Companion 返回了无效 JSON'); }
}
function unwrap<T>(response: CompanionResponse<T>): T {
  if (response.ok) return response.data;
  if (response.error.code === 'AUTH_REQUIRED' || response.error.code === 'AUTH_INVALID') throw new Error('Obsidian 连接已失效，请重新配对');
  if (response.error.code === 'VAULT_UNAVAILABLE') throw new Error('Obsidian Vault 暂时不可用');
  if (response.error.code === 'PAIRING_DISABLED') throw new Error('Obsidian 配对窗口未开启，请在 Obsidian Companion 设置中重新点击“生成配对码”');
  if (response.error.code === 'PAIRING_CODE_INVALID') throw new Error('配对码错误或已失效（5 分钟内有效且单次使用），请在 Obsidian 中重新生成');
  if (response.error.code === 'PROTOCOL_UNSUPPORTED') throw new Error('GuideRail 协议版本不兼容，请更新插件与扩展');
  throw new Error(response.error.message || 'Obsidian Companion 操作失败');
}
async function request<T>(base: string, path: string, parse: (value: unknown) => T, init: RequestInit = {}, token?: string): Promise<T> {
  let response: Response;
  try { response = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(30_000), headers: { 'Content-Type': 'application/json', [COMPANION_HEADERS.protocol]: String(COMPANION_PROTOCOL_VERSION), ...(token ? { [COMPANION_HEADERS.authorization]: `Bearer ${token}` } : {}), ...init.headers } }); }
  catch { throw new Error('无法连接 Obsidian，请确认 Obsidian 桌面端已启动且 GuideRail Companion 插件已开启'); }
  return unwrap(parseCompanionResponse(await responseJson(response), parse));
}
export async function pairCompanion(code: string, port = COMPANION_DEFAULT_PORT): Promise<CompanionConnection> {
  if (chrome.permissions?.request && !await chrome.permissions.request({ origins: ['http://127.0.0.1/*'] })) throw new Error('需要允许访问本机 Obsidian Companion');
  const base = companionOrigin(port); const storage = await chrome.storage.local.get('guiderail-installation-id');
  const clientId = typeof storage['guiderail-installation-id'] === 'string' ? storage['guiderail-installation-id'] : crypto.randomUUID();
  if (!storage['guiderail-installation-id']) await chrome.storage.local.set({ 'guiderail-installation-id': clientId });
  const data = await request<PairResponse>(base, companionRoutes.pair, parsePairResponse, { method: 'POST', body: JSON.stringify({ code: code.trim().toUpperCase(), client: { id: clientId, name: 'GuideRail', version: chrome.runtime.getManifest().version } }) });
  const connection = { origin: base, token: data.token, instanceId: data.instanceId, vaultName: data.vaultName, companionVersion: data.companionVersion };
  // Do not present a successful pairing until the returned token works on a
  // protected endpoint. This also prevents a stale success notice from hiding
  // an authentication failure immediately after pairing.
  await new CompanionClient(connection).status();
  await chrome.storage.local.set({ [COMPANION_CONNECTION_KEY]: connection, [LIBRARY_BACKEND_KEY]: 'companion', 'guiderail-library-target': crypto.randomUUID() }); return connection;
}
export async function loadCompanionConnection(): Promise<CompanionConnection | null> {
  const value = (await chrome.storage.local.get(COMPANION_CONNECTION_KEY))[COMPANION_CONNECTION_KEY];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null; const item = value as Record<string, unknown>;
  if (typeof item.origin !== 'string' || !/^http:\/\/127\.0\.0\.1:\d{4,5}$/.test(item.origin) || typeof item.token !== 'string' || item.token.length < 43 || typeof item.instanceId !== 'string' || typeof item.vaultName !== 'string' || typeof item.companionVersion !== 'string') return null;
  return item as unknown as CompanionConnection;
}
export class CompanionClient {
  constructor(private connection: CompanionConnection) {}
  status(): Promise<StatusResponse> { return request(this.connection.origin, companionRoutes.status, parseStatusResponse, {}, this.connection.token); }
  list(): Promise<LibraryIndex> { return request(this.connection.origin, companionRoutes.library, parseLibraryIndex, {}, this.connection.token); }
  saveCapture(capture: Capture, notebook: string, preferredTitle?: string): Promise<Entry> { return request(this.connection.origin, companionRoutes.captures, parseEntry, { method: 'POST', headers: { [COMPANION_HEADERS.idempotency]: captureIdempotencyKey(capture) }, body: JSON.stringify({ capture, notebook, ...(preferredTitle ? { preferredTitle } : {}) }) }, this.connection.token); }
  importEntry(content: EntryContentResponse): Promise<Entry> { return request(this.connection.origin, companionRoutes.imports, parseEntry, { method: 'POST', headers: { [COMPANION_HEADERS.idempotency]: `import:${content.entry.id}` }, body: JSON.stringify(content) }, this.connection.token); }
  readEntry(id: string) { return request(this.connection.origin, companionRoutes.entry(id), parseEntryContent, {}, this.connection.token); }
  createNotebook(name: string) { return request(this.connection.origin, companionRoutes.notebooks, value => { const item = record(value); if (typeof item.name !== 'string') throw new Error('Invalid notebook response'); return item.name; }, { method: 'POST', body: JSON.stringify({ name }) }, this.connection.token); }
  async renameEntry(id: string, title: string) { await request(this.connection.origin, companionRoutes.entry(id), () => undefined, { method: 'PATCH', body: JSON.stringify({ title }) }, this.connection.token); }
  async moveEntry(id: string, notebook: string) { await request(this.connection.origin, companionRoutes.moveEntry(id), () => undefined, { method: 'POST', body: JSON.stringify({ notebook }) }, this.connection.token); }
  hideEntry(id: string) { return request(this.connection.origin, companionRoutes.hideEntry(id), value => { const item = record(value); if (typeof item.undoToken !== 'string') throw new Error('Invalid undo token'); return item.undoToken; }, { method: 'POST', body: '{}' }, this.connection.token); }
  async restoreEntry(id: string, undoToken: string) { await request(this.connection.origin, companionRoutes.restoreEntry(id), () => undefined, { method: 'POST', body: JSON.stringify({ undoToken }) }, this.connection.token); }
  rebuildIndex() { return request(this.connection.origin, companionRoutes.rebuild, value => { const item = record(value); if (!Number.isInteger(item.count) || Number(item.count) < 0) throw new Error('Invalid rebuild response'); return Number(item.count); }, { method: 'POST', body: '{}' }, this.connection.token); }
}
