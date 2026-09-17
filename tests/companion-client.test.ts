import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CompanionClient, pairCompanion } from '../src/companion/client';
import { ObsidianLibraryBackend } from '../src/library/backend';

const connection = { origin: 'http://127.0.0.1:27124', token: 't'.repeat(43), instanceId: 'instance', vaultName: 'Vault', companionVersion: '0.1.0' };
const entry = { id: 'a'.repeat(64), title: '标题', notebook: '收件箱', filename: `${'a'.repeat(64)}.md`, createdAt: '2026-09-16T00:00:00Z', conversationId: 'chat', messageId: 'message', pageUrl: 'https://chatgpt.com/c/chat', images: [] };
const set = vi.fn(async () => {});
beforeEach(() => {
  vi.stubGlobal('chrome', { runtime: { getManifest: () => ({ version: '0.8.0' }) }, storage: { local: { get: vi.fn(async () => ({ 'guiderail-installation-id': 'install' })), set } } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); set.mockClear(); });
function envelope(data: unknown, status = 200) { return new Response(JSON.stringify({ ok: true, data }), { status, headers: { 'content-type': 'application/json' } }); }
it('pairs with the protocol header and stores the returned connection', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(envelope({ protocol: 1, companionVersion: '0.1.0', vaultName: 'Vault', instanceId: 'instance', token: 'x'.repeat(43) }))
    .mockResolvedValueOnce(envelope({ protocol: 1, companionVersion: '0.1.0', vaultName: 'Vault', instanceId: 'instance', paired: true, capabilities: ['library-v1', 'capture-json-base64', 'library-import-v1'] })); vi.stubGlobal('fetch', fetch);
  expect((await pairCompanion('abcd2345')).vaultName).toBe('Vault');
  const init = (fetch.mock.calls as unknown as [string, RequestInit][])[0][1]; expect(init.method).toBe('POST'); expect((init.headers as Record<string, string>)['X-GuideRail-Protocol']).toBe('1');
  expect((fetch.mock.calls as unknown as [string, RequestInit][])[1][0]).toBe('http://127.0.0.1:27124/v1/status');
  expect(set).toHaveBeenCalledWith(expect.objectContaining({ 'guiderail-library-backend': 'companion', 'guiderail-companion-connection': expect.objectContaining({ vaultName: 'Vault' }) }));
});
it('does not store a connection when the returned token fails verification', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(envelope({ protocol: 1, companionVersion: '0.1.0', vaultName: 'Vault', instanceId: 'instance', token: 'x'.repeat(43) }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: { code: 'AUTH_INVALID', message: 'no', retryable: false } }), { status: 403 })); vi.stubGlobal('fetch', fetch);
  await expect(pairCompanion('abcd2345')).rejects.toThrow('重新配对');
  expect(set).not.toHaveBeenCalledWith(expect.objectContaining({ 'guiderail-companion-connection': expect.anything() }));
});
it('sends authentication and the canonical idempotency key', async () => {
  const fetch = vi.fn(async () => envelope(entry, 201)); vi.stubGlobal('fetch', fetch); const client = new CompanionClient(connection);
  await client.saveCapture({ conversationId: 'chat', messageId: 'message', pageUrl: 'https://chatgpt.com/c/chat', role: 'assistant', text: '正文' }, '收件箱');
  const headers = (fetch.mock.calls as unknown as [string, RequestInit][])[0][1].headers as Record<string, string>;
  expect(headers.Authorization).toBe(`Bearer ${connection.token}`); expect(headers['Idempotency-Key']).toBe('capture:chat:message');
});
it('maps authentication and connection failures to actionable messages', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error: { code: 'AUTH_INVALID', message: 'no', retryable: false } }), { status: 403 })));
  await expect(new CompanionClient(connection).list()).rejects.toThrow('重新配对');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error: { code: 'PAIRING_DISABLED', message: 'disabled', retryable: false } }), { status: 403 })));
  await expect(pairCompanion('ABCD2345')).rejects.toThrow('配对窗口未开启');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error: { code: 'PAIRING_CODE_INVALID', message: 'invalid', retryable: false } }), { status: 403 })));
  await expect(pairCompanion('ABCD2345')).rejects.toThrow('配对码错误或已失效');
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('failed'); }));
  await expect(new CompanionClient(connection).list()).rejects.toThrow('无法连接 Obsidian');
});
it('rejects malformed successful responses instead of trusting localhost', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => envelope({ version: 1, entries: [{ ...entry, notebook: '../private' }] })));
  await expect(new CompanionClient(connection).list()).rejects.toThrow();
});
it('adapts companion Markdown and images to the shared library backend', async () => {
  chrome.storage.local.get = vi.fn(async () => ({ 'guiderail-companion-connection': connection })) as typeof chrome.storage.local.get;
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  vi.stubGlobal('fetch', vi.fn(async () => envelope({ entry: { ...entry, images: ['0.png'] }, markdown: '# 正文', images: [{ name: '0.png', data: png }] })));
  const result = await new ObsidianLibraryBackend().readEntry({ ...entry, images: ['0.png'] });
  expect(result.markdown).toBe('# 正文'); expect(result.images[0]).toBeInstanceOf(Blob); expect(result.images[0].type).toBe('image/png');
});
