import { afterEach, expect, it, vi } from 'vitest';
import { directoryLibraryBackend } from '../src/library/backend';
import { previewCompanionMigration, runCompanionMigration } from '../src/library/migrate-companion';

const connection = { origin: 'http://127.0.0.1:27124', token: 't'.repeat(43), instanceId: 'instance', vaultName: 'Vault', companionVersion: '0.1.0' };
const first = { id: 'a'.repeat(64), title: '已有', notebook: '收件箱', filename: `${'a'.repeat(64)}.md`, createdAt: '2026-09-01T00:00:00Z', conversationId: 'chat-a', messageId: 'message-a', pageUrl: 'https://chatgpt.com/c/chat-a', images: [] };
const second = { id: 'b'.repeat(64), title: '新增', notebook: '资料', filename: `${'b'.repeat(64)}.md`, createdAt: '2026-09-02T00:00:00Z', conversationId: 'chat-b', messageId: 'message-b', pageUrl: 'https://chatgpt.com/c/chat-b', images: [] };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('previews identical, importable and conflicting entries without changing either library', async () => {
  vi.spyOn(directoryLibraryBackend, 'list').mockResolvedValue({ version: 1, entries: [first, second] });
  vi.spyOn(directoryLibraryBackend, 'readEntry').mockImplementation(async entry => ({ markdown: `# ${entry.title}`, images: [] }));
  vi.stubGlobal('chrome', { storage: { local: { get: async () => ({ 'guiderail-companion-connection': connection }), set: async () => {} } } });
  const fetch = vi.fn(async (url: string) => url.endsWith('/v1/library')
    ? new Response(JSON.stringify({ ok: true, data: { version: 1, entries: [first] } }))
    : new Response(JSON.stringify({ ok: true, data: { entry: first, markdown: '# 已有', images: [] } })));
  vi.stubGlobal('fetch', fetch);
  const preview = await previewCompanionMigration(); expect(preview).toMatchObject({ sourceCount: 2, identical: 1, conflicts: [] }); expect(preview.importable).toEqual([second]);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('imports only previewed new entries and preserves their metadata and Markdown', async () => {
  vi.spyOn(directoryLibraryBackend, 'readEntry').mockResolvedValue({ markdown: '# 新增\n原始内容', images: [] });
  const set = vi.fn(async () => {}); vi.stubGlobal('chrome', { storage: { local: { get: async () => ({ 'guiderail-companion-connection': connection }), set } } });
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ ok: true, data: second }), { status: 201 })); vi.stubGlobal('fetch', fetch);
  const result = await runCompanionMigration({ sourceCount: 2, importable: [second], identical: 1, conflicts: [] }); expect(result).toEqual({ imported: 1, identical: 1, conflicts: 0 });
  const init = (fetch.mock.calls as unknown as [string, RequestInit][])[0][1]; const payload = JSON.parse(String(init.body));
  expect(payload).toEqual({ entry: second, markdown: '# 新增\n原始内容', images: [] }); expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe(`import:${second.id}`); expect(set).toHaveBeenCalled();
});
