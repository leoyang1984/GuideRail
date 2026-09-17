import { afterEach, expect, it, vi } from 'vitest';
import { CompanionServer, type CompanionServerSettings } from '../packages/obsidian-plugin/src/server';
import type { CompanionVaultLibrary } from '../packages/obsidian-plugin/src/vault-library';
import { captureIdempotencyKey } from '../src/companion/protocol';

const origin = `chrome-extension://${'a'.repeat(32)}`;
const capture = { conversationId: 'chat', messageId: 'message', pageUrl: 'https://chatgpt.com/c/chat', role: 'assistant' as const, text: '正文' };
let active: CompanionServer | null = null;
afterEach(async () => { await active?.stop(); active = null; });
function fixture() {
  const library = {
    list: vi.fn(async () => ({ version: 1, entries: [] })),
    saveCapture: vi.fn(async () => ({ id: 'a'.repeat(64), filename: `${'a'.repeat(64)}.md`, title: '正文', notebook: '收件箱', createdAt: '2026-09-16T00:00:00Z', conversationId: 'chat', messageId: 'message', pageUrl: 'https://chatgpt.com/c/chat', images: [] })),
    importEntry: vi.fn(async (value: { entry: unknown }) => value.entry),
  } as unknown as CompanionVaultLibrary;
  const settings: CompanionServerSettings = { port: 0, instanceId: 'instance', clients: [] }; const persist = vi.fn(async () => {});
  active = new CompanionServer(library, settings, persist, '0.1.0', 'Vault');
  return { server: active, library, settings, persist };
}
async function call(server: CompanionServer, path: string, init: RequestInit = {}) {
  return fetch(`http://127.0.0.1:${server.listeningPort()}${path}`, { ...init, headers: { Origin: origin, 'X-GuideRail-Protocol': '1', 'Content-Type': 'application/json', ...init.headers } });
}
async function pair(server: CompanionServer) {
  const code = server.startPairing(); const response = await call(server, '/v1/pair', { method: 'POST', body: JSON.stringify({ code, client: { id: 'install', name: 'GuideRail', version: '0.8.0' } }) });
  const body = await response.json() as { data: { token: string } }; return body.data.token;
}

it('binds a loopback server and denies protected endpoints before pairing', async () => {
  const { server } = fixture(); await server.start();
  const response = await call(server, '/v1/status'); expect(response.status).toBe(401);
  expect((await response.json() as { error: { code: string } }).error.code).toBe('AUTH_REQUIRED');
});
it('pairs once, stores only a token hash and authenticates the matching origin', async () => {
  const { server, settings, persist } = fixture(); await server.start(); const token = await pair(server);
  expect(token.length).toBeGreaterThanOrEqual(43); expect(JSON.stringify(settings)).not.toContain(token); expect(settings.clients[0].tokenHash).toHaveLength(64); expect(persist).toHaveBeenCalled();
  const status = await call(server, '/v1/status', { headers: { Authorization: `Bearer ${token}` } });
  expect(status.status).toBe(200); expect((await status.json() as { data: { vaultName: string } }).data.vaultName).toBe('Vault');
  const replay = await call(server, '/v1/pair', { method: 'POST', body: JSON.stringify({ code: 'ABCD2345', client: { id: 'other', name: 'GuideRail', version: '1' } }) }); expect(replay.status).toBe(403);
});
it('requires the canonical idempotency key before saving a capture', async () => {
  const { server, library } = fixture(); await server.start(); const token = await pair(server); const authorization = { Authorization: `Bearer ${token}` };
  const invalid = await call(server, '/v1/captures', { method: 'POST', headers: authorization, body: JSON.stringify({ capture, notebook: '收件箱' }) }); expect(invalid.status).toBe(400);
  const valid = await call(server, '/v1/captures', { method: 'POST', headers: { ...authorization, 'Idempotency-Key': captureIdempotencyKey(capture) }, body: JSON.stringify({ capture, notebook: '收件箱' }) });
  expect(valid.status).toBe(201); expect(library.saveCapture).toHaveBeenCalledOnce();
});
it('rejects non-extension origins before reading credentials', async () => {
  const { server } = fixture(); await server.start();
  const response = await fetch(`http://127.0.0.1:${server.listeningPort()}/v1/status`, { headers: { Origin: 'https://evil.example', 'X-GuideRail-Protocol': '1', Authorization: 'Bearer secret' } });
  expect(response.status).toBe(403); expect(response.headers.get('access-control-allow-origin')).toBeNull();
});
it('opts in to CORS private-network preflights only for extension origins', async () => {
  const { server } = fixture(); await server.start();
  const response = await call(server, '/v1/pair', { method: 'OPTIONS' }); expect(response.status).toBe(204);
  expect(response.headers.get('access-control-allow-private-network')).toBe('true'); expect(response.headers.get('access-control-allow-origin')).toBe(origin);
});
it('accepts imports only when their idempotency key matches the entry', async () => {
  const { server, library } = fixture(); await server.start(); const token = await pair(server); const authorization = { Authorization: `Bearer ${token}` };
  const payload = { entry: { id: 'b'.repeat(64) }, markdown: '# old', images: [] };
  const bad = await call(server, '/v1/imports', { method: 'POST', headers: authorization, body: JSON.stringify(payload) }); expect(bad.status).toBe(400);
  const good = await call(server, '/v1/imports', { method: 'POST', headers: { ...authorization, 'Idempotency-Key': `import:${'b'.repeat(64)}` }, body: JSON.stringify(payload) }); expect(good.status).toBe(201); expect(library.importEntry).toHaveBeenCalledOnce();
});
it('tracks active pairing state and fires onPair callback', async () => {
  const onPair = vi.fn();
  const { settings, library, persist } = fixture();
  active = new CompanionServer(library, settings, persist, '0.1.0', 'Vault', onPair);
  await active.start();
  expect(active.currentPairing()).toBeNull();
  const code = active.startPairing();
  const current = active.currentPairing();
  expect(current?.code).toBe(code);
  expect(current?.expiresAt).toBeGreaterThan(Date.now());
  const token = await pair(active);
  expect(token.length).toBeGreaterThanOrEqual(43);
  expect(active.currentPairing()).toBeNull();
  expect(onPair).toHaveBeenCalledOnce();
  expect(onPair.mock.calls[0][0].id).toBe('install');
});

it('authenticates extension GET requests when Origin header is omitted', async () => {
  const { server } = fixture(); await server.start(); const token = await pair(server);
  const response = await fetch(`http://127.0.0.1:${server.listeningPort()}/v1/status`, {
    headers: { 'X-GuideRail-Protocol': '1', Authorization: `Bearer ${token}` }
  });
  expect(response.status).toBe(200);
  expect((await response.json() as { data: { vaultName: string } }).data.vaultName).toBe('Vault');
  expect(response.headers.get('access-control-allow-origin')).toBe(origin);
});

it('rejects authenticated requests when Origin does not match paired client', async () => {
  const { server } = fixture(); await server.start(); const token = await pair(server);
  const wrongOrigin = `chrome-extension://${'b'.repeat(32)}`;
  const response = await fetch(`http://127.0.0.1:${server.listeningPort()}/v1/status`, {
    headers: { Origin: wrongOrigin, 'X-GuideRail-Protocol': '1', Authorization: `Bearer ${token}` }
  });
  expect(response.status).toBe(403);
});

it('rejects pairing when Origin is not a valid extension origin', async () => {
  const { server } = fixture(); await server.start(); const code = server.startPairing();
  const response = await fetch(`http://127.0.0.1:${server.listeningPort()}/v1/pair`, {
    method: 'POST',
    headers: { 'X-GuideRail-Protocol': '1', 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, client: { id: 'install', name: 'GuideRail', version: '0.8.0' } })
  });
  expect(response.status).toBe(403);
});
