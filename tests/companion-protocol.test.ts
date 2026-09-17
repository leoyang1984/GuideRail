import { expect, it } from 'vitest';
import {
  COMPANION_LIMITS,
  COMPANION_PROTOCOL_VERSION,
  captureIdempotencyKey,
  companionRoutes,
  parseCompanionResponse,
  parseEntryContent,
  parseLibraryIndex,
  parsePairResponse,
  parseStatusResponse,
  validateCaptureRequest,
  validatePairRequest,
} from '../src/companion/protocol';

const entry = {
  id: 'a'.repeat(64), title: '标题', notebook: '收件箱', filename: `${'a'.repeat(64)}.md`,
  createdAt: '2026-09-16T00:00:00.000Z', conversationId: 'chat-1', messageId: 'message-1',
  pageUrl: 'https://chatgpt.com/c/chat-1', images: [],
};
const capture = { conversationId: 'chat-1', messageId: 'message-1', pageUrl: 'https://chatgpt.com/c/chat-1', role: 'assistant', text: '正文' };

it('defines stable versioned routes and capture idempotency keys', () => {
  expect(COMPANION_PROTOCOL_VERSION).toBe(1);
  expect(companionRoutes.entry('a/b')).toBe('/v1/entries/a%2Fb');
  expect(captureIdempotencyKey(capture)).toBe('capture:chat-1:message-1');
  expect(() => captureIdempotencyKey({ conversationId: '../vault', messageId: 'message' })).toThrow();
});

it('validates pairing input and requires a high-entropy response token', () => {
  expect(validatePairRequest({ code: 'ABCD2345', client: { id: 'installation-id', name: 'GuideRail', version: '0.8.0' } }).code).toBe('ABCD2345');
  expect(() => validatePairRequest({ code: '1234', client: { id: 'id', name: 'GuideRail', version: '1' } })).toThrow();
  const response = { protocol: 1, companionVersion: '0.1.0', vaultName: 'Vault', instanceId: 'instance', token: 'x'.repeat(43) };
  expect(parsePairResponse(response).token).toHaveLength(43);
  expect(() => parsePairResponse({ ...response, token: 'short' })).toThrow();
});

it('parses only the frozen status capabilities and protocol version', () => {
  const status = { protocol: 1, companionVersion: '0.1.0', vaultName: 'Vault', instanceId: 'instance', paired: true, capabilities: ['library-v1', 'capture-json-base64'] };
  expect(parseStatusResponse(status)).toEqual(status);
  expect(() => parseStatusResponse({ ...status, protocol: 2 })).toThrow();
  expect(() => parseStatusResponse({ ...status, capabilities: ['filesystem'] })).toThrow();
});

it('validates success and error envelopes without trusting remote fields', () => {
  expect(parseCompanionResponse({ ok: true, data: { version: 1, entries: [entry] } }, parseLibraryIndex)).toEqual({ ok: true, data: { version: 1, entries: [entry] } });
  expect(parseCompanionResponse({ ok: false, error: { code: 'VAULT_UNAVAILABLE', message: 'Obsidian is closing', retryable: true } }, parseLibraryIndex)).toEqual({ ok: false, error: { code: 'VAULT_UNAVAILABLE', message: 'Obsidian is closing', retryable: true } });
  expect(() => parseCompanionResponse({ ok: false, error: { code: 'EXEC', message: 'bad', retryable: false } }, parseLibraryIndex)).toThrow();
});

it('rejects malformed remote indexes and mismatched entry content', () => {
  expect(parseLibraryIndex({ version: 1, entries: [entry], notebooks: ['收件箱'] }).entries[0]).toEqual(entry);
  expect(() => parseLibraryIndex({ version: 1, entries: [{ ...entry, filename: '../note.md' }] })).toThrow();
  expect(parseEntryContent({ entry, markdown: '# 正文', images: [] }).markdown).toBe('# 正文');
  expect(() => parseEntryContent({ entry: { ...entry, images: ['0.png'] }, markdown: '# 正文', images: [] })).toThrow();
});

it('enforces capture identity, image format and payload limits', () => {
  expect(validateCaptureRequest({ capture, notebook: '收件箱' })).toEqual({ capture, notebook: '收件箱' });
  expect(() => validateCaptureRequest({ capture: { ...capture, pageUrl: 'https://example.com' }, notebook: '收件箱' })).toThrow();
  expect(() => validateCaptureRequest({ capture: { ...capture, images: [{ data: 'https://example.com/image.png' }] }, notebook: '收件箱' })).toThrow();
  expect(() => validateCaptureRequest({ capture: { ...capture, markdown: 'x'.repeat(COMPANION_LIMITS.markdownCharacters + 1) }, notebook: '收件箱' })).toThrow();
});
